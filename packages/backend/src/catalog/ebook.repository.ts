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
  title?: string;
}

interface CreatedChapter {
  chapter: ReplaceContentChapterInput;
  id: string;
}

const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';
const PRISMA_RECORD_NOT_FOUND_CODE = 'P2025';

@Injectable()
export class EbookRepository {
  private readonly logger = new Logger(EbookRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEbookInput): Promise<Book> {
    try {
      const book = await this.prisma.book.create({
        data: {
          title: input.title,
          format: input.format,
          sizeBytes: input.sizeBytes,
          hash: input.hash,
          storageKey: input.storageKey,
          status: BookStatus.PENDING,
        },
      });

      this.logger.log(`Ebook criado: ${book.id} (hash ${input.hash}).`);
      return book;
    } catch (error) {
      return this.handleCreateFailure(input.hash, error);
    }
  }

  async findById(id: string): Promise<Book | null> {
    return this.prisma.book.findUnique({ where: { id } });
  }

  async findByHash(hash: string): Promise<Book | null> {
    return this.prisma.book.findUnique({ where: { hash } });
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
    const isFailure = status === BookStatus.FAILED;
    const persistedErrorMessage = isFailure ? (errorMessage ?? null) : null;

    try {
      await this.prisma.book.update({
        where: { id },
        data: { status, errorMessage: persistedErrorMessage },
      });
    } catch (error) {
      const isBookMissing = this.isKnownError(
        error,
        PRISMA_RECORD_NOT_FOUND_CODE,
      );
      if (!isBookMissing) throw error;
      throw new EbookNotFoundError(id);
    }

    this.logger.log(`Status do ebook ${id} alterado para ${status}.`);
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
    let chapterCount = 0;
    let chunkCount = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockBookOrThrow(tx, bookId);
        await tx.chapter.deleteMany({ where: { bookId } });

        const chapters = this.resolveChapters(input);
        const createdChapters = await this.createChapters(tx, bookId, chapters);
        chunkCount = await this.insertAllChunks(tx, createdChapters);
        chapterCount = createdChapters.length;

        if (input.title !== undefined) {
          await tx.book.update({
            where: { id: bookId },
            data: { title: input.title },
          });
        }
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

    return [{ position: 1, text: fullText, chunks: [] }];
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
