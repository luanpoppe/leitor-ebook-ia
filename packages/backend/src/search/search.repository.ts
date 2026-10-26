import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

export interface TextSearchMatch {
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
  text: string;
  rank: number;
}

interface TextSearchRow {
  chapter_position: number;
  chapter_title: string | null;
  char_offset: number;
  text: string;
  rank: number | string;
}

/**
 * Busca textual (FTS do Postgres, dicionário português) nos trechos do livro.
 * O índice GIN em `to_tsvector('portuguese', text)` é criado na migração.
 */
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    bookId: string,
    query: string,
    limit: number,
  ): Promise<TextSearchMatch[]> {
    const rows = await this.prisma.$queryRaw<TextSearchRow[]>`
      SELECT
        ch."position" AS "chapter_position",
        ch."title" AS "chapter_title",
        strpos(ch."text", left(c."text", 120)) AS "char_offset",
        c."text" AS "text",
        ts_rank(
          to_tsvector('portuguese', c."text"),
          websearch_to_tsquery('portuguese', ${query})
        ) AS "rank"
      FROM "chunks" c
      INNER JOIN "chapters" ch ON ch."id" = c."chapter_id"
      WHERE ch."book_id" = ${bookId}::uuid
        AND to_tsvector('portuguese', c."text")
          @@ websearch_to_tsquery('portuguese', ${query})
      ORDER BY "rank" DESC, ch."position" ASC, c."position" ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chapterPosition: Number(row.chapter_position),
      chapterTitle: row.chapter_title,
      offset: row.char_offset > 0 ? row.char_offset - 1 : 0,
      text: row.text,
      rank: Number(row.rank),
    }));
  }
}
