import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

export interface ChunkMatch {
  text: string;
  chapterPosition: number;
  chapterTitle: string | null;
  chunkPosition: number;
  /** Offset 0-based do trecho dentro do capítulo; 0 quando não foi possível achar. */
  charOffset: number;
  similarity: number;
}

interface ChunkMatchRow {
  text: string;
  chapter_position: number;
  chapter_title: string | null;
  chunk_position: number;
  char_offset: number;
  similarity: number | string;
}

// Prefixo do chunk usado para localizar o trecho dentro do capítulo. O chunker
// repete ~150 caracteres do trecho anterior, então o offset achado aponta para
// o começo da passagem, não para o primeiro caractere novo.
const OFFSET_PROBE_LENGTH = 120;

/**
 * Busca por similaridade nos trechos indexados do livro. Lê o vetor do pgvector
 * por SQL puro, no mesmo padrão da leitura de capítulos.
 */
@Injectable()
export class ChunkSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    bookId: string,
    vector: number[],
    limit: number,
  ): Promise<ChunkMatch[]> {
    const vectorLiteral = toVectorLiteral(vector);

    const rows = await this.prisma.$queryRaw<ChunkMatchRow[]>`
      SELECT
        c."text" AS "text",
        ch."position" AS "chapter_position",
        ch."title" AS "chapter_title",
        c."position" AS "chunk_position",
        strpos(ch."text", left(c."text", ${OFFSET_PROBE_LENGTH})) AS "char_offset",
        (1 - (c."embedding" <=> ${vectorLiteral}::vector)) AS "similarity"
      FROM "chunks" c
      INNER JOIN "chapters" ch ON ch."id" = c."chapter_id"
      WHERE ch."book_id" = ${bookId}::uuid
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      text: row.text,
      chapterPosition: row.chapter_position,
      chapterTitle: row.chapter_title,
      chunkPosition: row.chunk_position,
      charOffset: row.char_offset > 0 ? row.char_offset - 1 : 0,
      similarity: Number(row.similarity),
    }));
  }
}

// pgvector aceita o literal textual `[0.1,0.2,...]`; o cast fica no SQL.
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
