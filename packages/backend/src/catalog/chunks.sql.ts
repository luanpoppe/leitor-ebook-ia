import { Prisma } from '../generated/prisma/client';
import {
  ChunkEmbeddingUpdate,
  ReplaceContentChunkInput,
} from './ebook-content.types';

/**
 * Builders puros de SQL dos chunks. A coluna `chunks.embedding` é
 * `Unsupported` no Prisma Client, então a escrita (insert e update) é feita
 * por SQL bruto; aqui só se monta o fragmento, sem tocar no banco.
 */
export class ChunkSql {
  static toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  static buildChunkRow(
    chapterId: string,
    chunk: ReplaceContentChunkInput,
  ): Prisma.Sql {
    const embedding = chunk.embedding ?? null;
    if (embedding === null) {
      return Prisma.sql`(gen_random_uuid(), ${chapterId}::uuid, ${chunk.position}, ${chunk.text}, NULL::vector)`;
    }

    const vectorLiteral = ChunkSql.toVectorLiteral(embedding);
    return Prisma.sql`(gen_random_uuid(), ${chapterId}::uuid, ${chunk.position}, ${chunk.text}, ${vectorLiteral}::vector)`;
  }

  /** Tuplas `(id, position, text, embedding)` prontas para o `VALUES` do insert. */
  static buildChunkValues(
    chapterId: string,
    chunks: ReplaceContentChunkInput[],
  ): Prisma.Sql {
    const rows = chunks.map((chunk) =>
      ChunkSql.buildChunkRow(chapterId, chunk),
    );

    return Prisma.join(rows);
  }

  /** Tuplas `(id, embedding)` prontas para o `VALUES` do update em lote. */
  static buildEmbeddingValues(updates: ChunkEmbeddingUpdate[]): Prisma.Sql {
    const rows = updates.map((update) =>
      ChunkSql.buildEmbeddingValueRow(update),
    );

    return Prisma.join(rows);
  }

  private static buildEmbeddingValueRow(
    update: ChunkEmbeddingUpdate,
  ): Prisma.Sql {
    const vectorLiteral = ChunkSql.toVectorLiteral(update.embedding);
    return Prisma.sql`(${update.chunkId}::uuid, ${vectorLiteral}::vector)`;
  }
}
