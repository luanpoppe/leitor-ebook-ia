import { Injectable, Logger } from '@nestjs/common';
import {
  Book,
  BookFormat,
  BookStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';
import {
  DuplicateEbookError,
  EbookNotFoundError,
  InvalidEbookContentError,
  InvalidEbookInputError,
} from './catalog.errors';

export interface CreateEbookInput {
  title: string;
  format: BookFormat;
  sizeBytes: number;
  hash: string;
  storageKey: string;
}

export interface ListEbooksParams {
  take?: number;
  skip?: number;
}

export interface ReplaceContentChunkInput {
  position: number;
  text: string;
  embedding: number[];
}

export interface ReplaceContentChapterInput {
  position: number;
  text: string;
  chunks: ReplaceContentChunkInput[];
}

export interface ReplaceContentInput {
  chapters: ReplaceContentChapterInput[];
  fullText?: string;
  fullTextChunks?: ReplaceContentChunkInput[];
  title?: string;
  status?: BookStatus;
  errorMessage?: string | null;
}

interface CreatedChapter {
  chapter: ReplaceContentChapterInput;
  id: string;
}

const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_FAILURE_MESSAGE = 'Falha na ingestão sem detalhe informado.';

@Injectable()
export class EbookRepository {
  private readonly logger = new Logger(EbookRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEbookInput): Promise<Book> {
    const normalizedHash = this.assertValidCreateInput(input);

    try {
      const book = await this.prisma.book.create({
        data: {
          title: input.title,
          format: input.format,
          sizeBytes: input.sizeBytes,
          hash: normalizedHash,
          storageKey: input.storageKey,
          status: BookStatus.PENDING,
        },
      });

      this.logger.log(`Ebook criado: ${book.id} (hash ${normalizedHash}).`);
      return book;
    } catch (error) {
      return this.handleCreateFailure(normalizedHash, error);
    }
  }

  async findById(id: string): Promise<Book | null> {
    const isIdValid = this.isUuid(id);
    if (!isIdValid) return null;

    return this.prisma.book.findUnique({ where: { id } });
  }

  async findByHash(hash: string): Promise<Book | null> {
    const normalizedHash = hash.trim().toLowerCase();
    const isHashValid = HASH_PATTERN.test(normalizedHash);
    if (!isHashValid) return null;

    return this.prisma.book.findUnique({ where: { hash: normalizedHash } });
  }

  async list(params: ListEbooksParams = {}): Promise<Book[]> {
    return this.prisma.book.findMany({
      take: params.take,
      skip: params.skip,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async updateStatus(
    id: string,
    status: BookStatus,
    errorMessage?: string | null,
  ): Promise<void> {
    this.assertUuidOrNotFound(id);

    const data = this.buildStatusUpdateData(status, errorMessage);

    // Atualização condicional: um ebook já READY não volta a PENDING/PROCESSING/FAILED
    // por causa de um retry obsoleto.
    const result = await this.prisma.book.updateMany({
      where: { id, status: { not: BookStatus.READY } },
      data,
    });

    const wasUpdated = result.count > 0;
    if (wasUpdated) {
      this.logger.log(`Status do ebook ${id} alterado para ${status}.`);
      return;
    }

    await this.handleStatusUpdateBlocked(id, status);
  }

  /**
   * Substitui capítulos e chunks de um ebook de forma atômica.
   * `chunks.embedding` não existe no Prisma Client (coluna `Unsupported`),
   * por isso a escrita dos chunks é feita por SQL bruto parametrizado.
   */
  async replaceContent(
    bookId: string,
    input: ReplaceContentInput,
  ): Promise<void> {
    this.assertUuidOrNotFound(bookId);

    const chapters = this.resolveChapters(input);
    this.assertValidContent(chapters);

    let chapterCount = 0;
    let chunkCount = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockBookOrThrow(tx, bookId);
        await tx.chapter.deleteMany({ where: { bookId } });

        const createdChapters = await this.createChapters(tx, bookId, chapters);
        chunkCount = await this.insertAllChunks(tx, createdChapters);
        chapterCount = createdChapters.length;

        await this.updateBookMetadata(tx, bookId, input);
      });
    } catch (error) {
      const reason = this.describeError(error);
      this.logger.error(
        `Falha ao substituir conteúdo do ebook ${bookId}: ${reason}`,
      );
      throw error;
    }

    this.logger.log(
      `Conteúdo do ebook ${bookId} substituído: ${chapterCount} capítulo(s), ${chunkCount} chunk(s).`,
    );
  }

  private assertValidCreateInput(input: CreateEbookInput): string {
    const isTitleEmpty = input.title.trim().length === 0;
    if (isTitleEmpty) {
      throw new InvalidEbookInputError(
        'O título do ebook não pode ser vazio.',
      );
    }

    const normalizedHash = input.hash.trim().toLowerCase();
    const isHashValid = HASH_PATTERN.test(normalizedHash);
    if (!isHashValid) {
      throw new InvalidEbookInputError(
        'O hash do ebook deve ter 64 caracteres hexadecimais (SHA-256).',
      );
    }

    const isStorageKeyEmpty = input.storageKey.trim().length === 0;
    if (isStorageKeyEmpty) {
      throw new InvalidEbookInputError(
        'A chave de armazenamento do ebook não pode ser vazia.',
      );
    }

    const isSizeInvalid =
      !Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0;
    if (isSizeInvalid) {
      throw new InvalidEbookInputError(
        'O tamanho do ebook deve ser maior que zero.',
      );
    }

    return normalizedHash;
  }

  private buildStatusUpdateData(
    status: BookStatus,
    errorMessage?: string | null,
  ): Prisma.BookUpdateManyMutationInput {
    const isFailure = status === BookStatus.FAILED;
    if (!isFailure) return { status, errorMessage: null };

    return { status, errorMessage: this.resolveFailureMessage(errorMessage) };
  }

  private resolveFailureMessage(errorMessage?: string | null): string {
    const detail = errorMessage?.trim();
    if (!detail) return DEFAULT_FAILURE_MESSAGE;

    return detail;
  }

  private async handleStatusUpdateBlocked(
    id: string,
    attemptedStatus: BookStatus,
  ): Promise<void> {
    const existingBook = await this.prisma.book.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existingBook) throw new EbookNotFoundError(id);

    this.logger.log(
      `Atualização de status ignorada para o ebook ${id}: já está ${existingBook.status} (tentativa de ${attemptedStatus}).`,
    );
  }

  private async updateBookMetadata(
    tx: Prisma.TransactionClient,
    bookId: string,
    input: ReplaceContentInput,
  ): Promise<void> {
    const data: Prisma.BookUpdateInput = {};

    const trimmedTitle = input.title?.trim();
    const hasTitle = Boolean(trimmedTitle);
    if (hasTitle) data.title = trimmedTitle;

    if (input.status !== undefined) {
      data.status = input.status;
      const isFailure = input.status === BookStatus.FAILED;
      data.errorMessage = isFailure
        ? this.resolveFailureMessage(input.errorMessage)
        : null;
    }

    const hasMetadataChanges = Object.keys(data).length > 0;
    if (!hasMetadataChanges) return;

    await tx.book.update({ where: { id: bookId }, data });
  }

  private resolveChapters(
    input: ReplaceContentInput,
  ): ReplaceContentChapterInput[] {
    const hasChapters = input.chapters.length > 0;
    if (hasChapters) return input.chapters;

    const fullText = input.fullText;
    if (!fullText || fullText.trim().length === 0) {
      throw new InvalidEbookContentError(
        'Ebook sem capítulos e sem texto completo para usar como fallback.',
      );
    }

    const fullTextChunks = input.fullTextChunks ?? [];
    return [{ position: 1, text: fullText, chunks: fullTextChunks }];
  }

  private assertValidContent(chapters: ReplaceContentChapterInput[]): void {
    for (const [chapterIndex, chapter] of chapters.entries()) {
      this.assertValidChapterText(chapter, chapterIndex);
      this.assertValidChunks(chapter.chunks, chapterIndex);
    }
  }

  private assertValidChapterText(
    chapter: ReplaceContentChapterInput,
    chapterIndex: number,
  ): void {
    const isTextEmpty = chapter.text.trim().length === 0;
    if (!isTextEmpty) return;

    throw new InvalidEbookContentError(
      `Capítulo ${chapterIndex + 1} (posição ${chapter.position}) está com texto vazio.`,
    );
  }

  private assertValidChunks(
    chunks: ReplaceContentChunkInput[],
    chapterIndex: number,
  ): void {
    for (const [chunkIndex, chunk] of chunks.entries()) {
      this.assertValidChunk(chunk, chapterIndex, chunkIndex);
    }
  }

  private assertValidChunk(
    chunk: ReplaceContentChunkInput,
    chapterIndex: number,
    chunkIndex: number,
  ): void {
    const location = `capítulo ${chapterIndex + 1}, chunk ${chunkIndex + 1}`;

    const isTextEmpty = chunk.text.trim().length === 0;
    if (isTextEmpty) {
      throw new InvalidEbookContentError(`Texto vazio no ${location}.`);
    }

    const embedding = chunk.embedding;
    const hasExpectedDimensions = embedding.length === EMBEDDING_DIMENSIONS;
    if (!hasExpectedDimensions) {
      throw new InvalidEbookContentError(
        `Embedding com ${embedding.length} dimensões no ${location} (esperado: ${EMBEDDING_DIMENSIONS}).`,
      );
    }

    const hasInvalidValue = embedding.some((value) => !Number.isFinite(value));
    if (hasInvalidValue) {
      throw new InvalidEbookContentError(
        `Embedding com valor não numérico no ${location}.`,
      );
    }
  }

  private async handleCreateFailure(
    hash: string,
    error: unknown,
  ): Promise<Book> {
    const isDuplicateHash = this.isKnownError(
      error,
      PRISMA_UNIQUE_CONSTRAINT_CODE,
    );
    if (!isDuplicateHash) throw error;

    const existingBook = await this.prisma.book.findUnique({
      where: { hash },
      select: { id: true },
    });
    if (!existingBook) throw error;

    this.logger.warn(
      `Ebook duplicado detectado para o hash ${hash} (id ${existingBook.id}).`,
    );
    throw new DuplicateEbookError(existingBook.id);
  }

  private async lockBookOrThrow(
    tx: Prisma.TransactionClient,
    bookId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "books" WHERE "id" = ${bookId}::uuid FOR UPDATE
    `;

    const bookWasFound = rows.length > 0;
    if (!bookWasFound) throw new EbookNotFoundError(bookId);
  }

  private async createChapters(
    tx: Prisma.TransactionClient,
    bookId: string,
    chapters: ReplaceContentChapterInput[],
  ): Promise<CreatedChapter[]> {
    const createdChapters: CreatedChapter[] = [];

    for (const chapter of chapters) {
      const created = await tx.chapter.create({
        data: {
          bookId,
          position: chapter.position,
          text: chapter.text,
        },
        select: { id: true },
      });

      createdChapters.push({ chapter, id: created.id });
    }

    return createdChapters;
  }

  private async insertAllChunks(
    tx: Prisma.TransactionClient,
    createdChapters: CreatedChapter[],
  ): Promise<number> {
    let totalInserted = 0;

    for (const createdChapter of createdChapters) {
      const inserted = await this.insertChapterChunks(
        tx,
        createdChapter.id,
        createdChapter.chapter.chunks,
      );
      totalInserted += inserted;
    }

    return totalInserted;
  }

  private async insertChapterChunks(
    tx: Prisma.TransactionClient,
    chapterId: string,
    chunks: ReplaceContentChunkInput[],
  ): Promise<number> {
    const hasChunks = chunks.length > 0;
    if (!hasChunks) return 0;

    const rows = chunks.map((chunk) =>
      this.buildChunkRow(chapterId, chunk),
    );
    const values = Prisma.join(rows);

    await tx.$executeRaw`
      INSERT INTO "chunks" ("id", "chapter_id", "position", "text", "embedding")
      VALUES ${values}
    `;

    return chunks.length;
  }

  private buildChunkRow(
    chapterId: string,
    chunk: ReplaceContentChunkInput,
  ): Prisma.Sql {
    const vectorLiteral = this.toVectorLiteral(chunk.embedding);

    return Prisma.sql`(gen_random_uuid(), ${chapterId}::uuid, ${chunk.position}, ${chunk.text}, ${vectorLiteral}::vector)`;
  }

  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  private isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  private assertUuidOrNotFound(id: string): void {
    const isIdValid = this.isUuid(id);
    if (isIdValid) return;

    throw new EbookNotFoundError(id);
  }

  private isKnownError(error: unknown, code: string): boolean {
    const isPrismaError =
      error instanceof Prisma.PrismaClientKnownRequestError;
    if (!isPrismaError) return false;
    return error.code === code;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
