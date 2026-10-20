import { Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS } from '../core/ai/embedding.constants';
import { PrismaService } from '../core/prisma.service';
import { EbookNotFoundError, InvalidEbookContentError } from './catalog.errors';
import { ChunkSql } from './chunks.sql';
import {
  ChunkEmbeddingUpdate,
  MissingEmbeddingChunk,
} from './ebook-content.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vetorização dos trechos: leitura dos chunks sem embedding e gravação em
 * lote. Separado do `EbookContentRepository` porque é a retomada que usa
 * estes métodos, não a substituição de conteúdo.
 */
@Injectable()
export class ChunkEmbeddingRepository {
  private readonly logger = new Logger(ChunkEmbeddingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Total de trechos do livro, com ou sem embedding. Zero significa livro
   * ainda sem chunking — não confundir com livro 100% vetorizado.
   */
  async countChunks(bookId: string): Promise<number> {
    this.assertUuidOrNotFound(bookId);

    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | string }>>`
      SELECT count(*) AS "count"
      FROM "chunks" c
      INNER JOIN "chapters" ch ON ch."id" = c."chapter_id"
      WHERE ch."book_id" = ${bookId}::uuid
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

    const values = ChunkSql.buildEmbeddingValues(updates);

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

  /**
   * Ausente ou nulo é aceito: o trecho fica sem vetor e a retomada completa
   * depois. Quando presente, o vetor precisa ter as dimensões do pgvector.
   */
  private assertValidEmbedding(embedding: number[] | null | undefined, location: string): void {
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

  private isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  private assertUuidOrNotFound(id: string): void {
    const isIdValid = this.isUuid(id);
    if (isIdValid) return;

    throw new EbookNotFoundError(id);
  }
}
