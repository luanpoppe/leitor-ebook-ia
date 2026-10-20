import { Injectable, Logger } from '@nestjs/common';
import { BookStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';
import {
  EbookNotFoundError,
  InvalidEbookContentError,
} from './catalog.errors';
import {
  ChunkEmbeddingUpdate,
  MissingEmbeddingChunk,
  ReplaceContentChapterInput,
  ReplaceContentChunkInput,
  ReplaceContentInput,
} from './ebook-content.types';

interface CreatedChapter {
  chapter: ReplaceContentChapterInput;
  id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_FAILURE_MESSAGE = 'Falha na ingestão sem detalhe informado.';

@Injectable()
export class EbookContentRepository {
  private readonly logger = new Logger(EbookContentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Trechos do livro que ainda não têm embedding, na ordem de leitura.
   * É a base da retomada: só eles vão para a API de embeddings.
   */
  async findChunksWithoutEmbedding(
    bookId: string,
  ): Promise<MissingEmbeddingChunk[]> {
    this.assertUuidOrNotFound(bookId);

    const chunks = await this.prisma.$queryRaw<MissingEmbeddingChunk[]>`
      SELECT
        c."id",
        ch."position" AS "chapterPosition",
        c."position",
        c."text"
      FROM "chunks" c
      INNER JOIN "chapters" ch ON ch."id" = c."chapter_id"
      WHERE ch."book_id" = ${bookId}::uuid
        AND c."embedding" IS NULL
      ORDER BY ch."position", c."position"
    `;

    return chunks;
  }

  async countChunksWithoutEmbedding(bookId: string): Promise<number> {
    this.assertUuidOrNotFound(bookId);

    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | string }>>`
      SELECT count(*) AS "count"
      FROM "chunks" c
      INNER JOIN "chapters" ch ON ch."id" = c."chapter_id"
      WHERE ch."book_id" = ${bookId}::uuid
        AND c."embedding" IS NULL
    `;

    const count = rows[0]?.count ?? 0;
    return Number(count);
  }

  /**
   * Grava embeddings em lote apenas nos chunks ainda sem vetor, o que torna
   * a retomada idempotente: linhas já vetorizadas não são sobrescritas.
   */
  async updateChunkEmbeddings(
    updates: ChunkEmbeddingUpdate[],
  ): Promise<number> {
    const hasUpdates = updates.length > 0;
    if (!hasUpdates) return 0;

    this.assertValidUpdates(updates);

    const rows = updates.map((update) => {
      const vectorLiteral = this.toVectorLiteral(update.embedding);
      return Prisma.sql`(${update.chunkId}::uuid, ${vectorLiteral}::vector)`;
    });
    const values = Prisma.join(rows);

    const affected = await this.prisma.$executeRaw`
      UPDATE "chunks" AS c
      SET "embedding" = v."embedding"
      FROM (VALUES ${values}) AS v("id", "embedding")
      WHERE c."id" = v."id"
        AND c."embedding" IS NULL
    `;

    const hasAffectedAllUpdates = affected === updates.length;
    if (!hasAffectedAllUpdates) {
      this.logger.warn(
        `Atualização de embeddings parcial: ${affected} de ${updates.length} chunk(s) gravado(s).`,
      );
    }

    return affected;
  }

  private assertValidUpdates(updates: ChunkEmbeddingUpdate[]): void {
    for (const [index, update] of updates.entries()) {
      const location = `chunk ${update.chunkId} (item ${index + 1})`;
      this.assertValidEmbedding(update.embedding, location);
    }
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
    const hasFullText = fullText !== undefined && fullText.trim().length > 0;
    if (!hasFullText) {
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

    this.assertValidEmbedding(chunk.embedding, location);
  }

  /**
   * Ausente ou nulo é aceito: o trecho fica sem vetor e a retomada completa
   * depois. Quando presente, o vetor precisa ter as dimensões do pgvector.
   */
  private assertValidEmbedding(
    embedding: number[] | null | undefined,
    location: string,
  ): void {
    if (embedding == null) return;

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

  private resolveFailureMessage(errorMessage?: string | null): string {
    const detail = errorMessage?.trim();
    if (!detail) return DEFAULT_FAILURE_MESSAGE;

    return detail;
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

    const rows = chunks.map((chunk) => this.buildChunkRow(chapterId, chunk));
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
    const embedding = chunk.embedding ?? null;
    if (embedding === null) {
      return Prisma.sql`(gen_random_uuid(), ${chapterId}::uuid, ${chunk.position}, ${chunk.text}, NULL::vector)`;
    }

    const vectorLiteral = this.toVectorLiteral(embedding);
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

  private describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
