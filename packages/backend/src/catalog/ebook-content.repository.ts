import { Injectable, Logger } from '@nestjs/common';
import { BookStatus, Prisma } from '../generated/prisma/client';
import { EMBEDDING_DIMENSIONS } from '../core/ai/embedding.constants';
import { PrismaService } from '../core/prisma.service';
import {
  EbookNotFoundError,
  InvalidEbookContentError,
} from './catalog.errors';
import { ChunkSql } from './chunks.sql';
import {
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
const DEFAULT_FAILURE_MESSAGE = 'Falha na ingestão sem detalhe informado.';

/**
 * Substitui capítulos e chunks de um ebook de forma atômica. A vetorização
 * (leitura dos chunks sem embedding e gravação dos vetores) fica no
 * `ChunkEmbeddingRepository`.
 */
@Injectable()
export class EbookContentRepository {
  private readonly logger = new Logger(EbookContentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
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
      const isTextEmpty = chapter.text.trim().length === 0;
      if (isTextEmpty) {
        throw new InvalidEbookContentError(
          `Capítulo ${chapterIndex + 1} (posição ${chapter.position}) está com texto vazio.`,
        );
      }

      this.assertValidChunks(chapter.chunks, chapterIndex);
    }
  }

  private assertValidChunks(
    chunks: ReplaceContentChunkInput[],
    chapterIndex: number,
  ): void {
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const location = `capítulo ${chapterIndex + 1}, chunk ${chunkIndex + 1}`;

      const isTextEmpty = chunk.text.trim().length === 0;
      if (isTextEmpty) {
        throw new InvalidEbookContentError(`Texto vazio no ${location}.`);
      }

      this.assertValidEmbedding(chunk.embedding, location);
    }
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

    const values = ChunkSql.buildChunkValues(chapterId, chunks);

    await tx.$executeRaw`
      INSERT INTO "chunks" ("id", "chapter_id", "position", "text", "embedding")
      VALUES ${values}
    `;

    return chunks.length;
  }

  private assertUuidOrNotFound(id: string): void {
    const isIdValid = UUID_PATTERN.test(id);
    if (isIdValid) return;

    throw new EbookNotFoundError(id);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
