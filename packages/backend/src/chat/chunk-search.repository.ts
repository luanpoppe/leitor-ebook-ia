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

// Localização do trecho dentro do capítulo. O chunker repete ~150 caracteres
// do trecho anterior, então a sonda começa depois do overlap: o offset assim
// aponta para o começo do conteúdo novo, não para a repetição.
const OFFSET_PROBE_INDEX = 160;
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
        CASE
          WHEN strpos(ch."text", substr(c."text", ${OFFSET_PROBE_INDEX + 1}, ${OFFSET_PROBE_LENGTH})) > 0
            THEN GREATEST(
              0,
              strpos(
                ch."text",
                substr(c."text", ${OFFSET_PROBE_INDEX + 1}, ${OFFSET_PROBE_LENGTH})
              ) - 1 - ${OFFSET_PROBE_INDEX}
            )
          WHEN strpos(ch."text", left(c."text", ${OFFSET_PROBE_LENGTH})) > 0
            THEN strpos(ch."text", left(c."text", ${OFFSET_PROBE_LENGTH})) - 1
          ELSE 0
        END AS "char_offset",
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
      // A sonda em 161 aponta para o conteúdo novo do chunk (depois do overlap),
      // então o offset já é o começo do trecho no capítulo, em base 0.
      charOffset: Math.max(0, row.char_offset),
      similarity: Number(row.similarity),
    }));
  }
}

// pgvector aceita o literal textual `[0.1,0.2,...]`; o cast fica no SQL.
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
