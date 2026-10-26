import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

export interface ChapterSummary {
  id: string;
  position: number;
  title: string | null;
  wordCount: number;
}

export interface ChapterPage {
  id: string;
  position: number;
  title: string | null;
  text: string;
  totalLength: number;
}

export interface AdjacentPositions {
  previousPosition: number | null;
  nextPosition: number | null;
}

export interface ChapterSummaryRecord {
  position: number;
  title: string | null;
  summary: string;
}

export interface ChapterSectionRecord {
  position: number;
  startOffset: number;
  endOffset: number;
  summary: string;
}

interface ChapterSummaryRow {
  id: string;
  position: number;
  title: string | null;
  word_count: number | string;
}

interface ChapterPageRow {
  id: string;
  position: number;
  title: string | null;
  text: string;
  total_length: number | string;
}

interface AdjacentPositionsRow {
  previous_position: number | null;
  next_position: number | null;
}

/**
 * Leitura dos capítulos para o leitor: sumário sem trazer o texto e uma página
 * de texto por offset de caractere. A contagem de palavras é feita no banco,
 * não em memória, para não transportar o capítulo inteiro só para contá-lo.
 */
@Injectable()
export class ChapterReadingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSummaries(bookId: string): Promise<ChapterSummary[]> {
    const rows = await this.prisma.$queryRaw<ChapterSummaryRow[]>`
      SELECT
        "id",
        "position",
        "title",
        regexp_count(btrim("text"), '\\s+') + 1 AS "word_count"
      FROM "chapters"
      WHERE "book_id" = ${bookId}::uuid
      ORDER BY "position" ASC
    `;

    return rows.map((row) => this.toChapterSummary(row));
  }

  async findPage(
    bookId: string,
    position: number,
    offset: number,
    limit: number,
  ): Promise<ChapterPage | null> {
    const rows = await this.prisma.$queryRaw<ChapterPageRow[]>`
      SELECT
        "id",
        "position",
        "title",
        substr("text", ${offset} + 1, ${limit}) AS "text",
        char_length("text") AS "total_length"
      FROM "chapters"
      WHERE "book_id" = ${bookId}::uuid
        AND "position" = ${position}
    `;

    const row = rows[0];
    const hasRow = row !== undefined;
    if (!hasRow) return null;

    return this.toChapterPage(row);
  }

  // Tamanho em caracteres do capítulo, usado para validar o offset antes de
  // gravar o progresso. `null` quando a posição não existe no ebook.
  async findChapterLength(
    bookId: string,
    position: number,
  ): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ length: number | string }>
    >`
      SELECT char_length("text") AS "length"
      FROM "chapters"
      WHERE "book_id" = ${bookId}::uuid
        AND "position" = ${position}
    `;

    const row = rows[0];
    const hasRow = row !== undefined;
    if (!hasRow) return null;

    return Number(row.length);
  }

  async findAdjacentPositions(
    bookId: string,
    position: number,
  ): Promise<AdjacentPositions> {
    const rows = await this.prisma.$queryRaw<AdjacentPositionsRow[]>`
      SELECT
        (
          SELECT MAX("position")
          FROM "chapters"
          WHERE "book_id" = ${bookId}::uuid
            AND "position" < ${position}
        ) AS "previous_position",
        (
          SELECT MIN("position")
          FROM "chapters"
          WHERE "book_id" = ${bookId}::uuid
            AND "position" > ${position}
        ) AS "next_position"
    `;

    const row = rows[0];
    const hasRow = row !== undefined;
    if (!hasRow) {
      return { previousPosition: null, nextPosition: null };
    }

    return {
      previousPosition: this.toNullableNumber(row.previous_position),
      nextPosition: this.toNullableNumber(row.next_position),
    };
  }

  /** Resumos gerados na ingestão, para o planejador do chat escolher capítulos. */
  async listChapterSummaries(bookId: string): Promise<ChapterSummaryRecord[]> {
    const rows = await this.prisma.chapter.findMany({
      where: { bookId, summary: { not: null } },
      orderBy: { position: 'asc' },
      select: { position: true, title: true, summary: true },
    });

    return rows.flatMap((row) => {
      if (row.summary === null) return [];

      return [
        { position: row.position, title: row.title, summary: row.summary },
      ];
    });
  }

  /** Resumos das partes do capítulo que o leitor já passou. */
  async listReadSections(
    bookId: string,
    position: number,
    upToOffset: number,
    limit: number,
  ): Promise<ChapterSectionRecord[]> {
    const rows = await this.prisma.chapterSection.findMany({
      where: {
        chapter: { bookId, position },
        endOffset: { lte: upToOffset },
      },
      orderBy: { position: 'desc' },
      take: limit,
      select: {
        position: true,
        startOffset: true,
        endOffset: true,
        summary: true,
      },
    });

    return rows.reverse();
  }

  private toChapterSummary(row: ChapterSummaryRow): ChapterSummary {
    return {
      id: row.id,
      position: Number(row.position),
      title: row.title,
      wordCount: Number(row.word_count),
    };
  }

  private toChapterPage(row: ChapterPageRow): ChapterPage {
    return {
      id: row.id,
      position: Number(row.position),
      title: row.title,
      text: row.text,
      totalLength: Number(row.total_length),
    };
  }

  private toNullableNumber(value: number | string | null): number | null {
    if (value == null) return null;
    return Number(value);
  }
}