import { Injectable } from '@nestjs/common';
import { Highlight, HighlightColor } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';
import type { HighlightColorValue } from './highlights.schemas';

export interface CreateHighlightRecord {
  chapterPosition: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  color: HighlightColor;
}

export interface HighlightFilters {
  query?: string;
  color?: HighlightColor;
}

export interface HighlightWithBookRecord extends Highlight {
  book: {
    id: string;
    title: string;
    author: string | null;
  };
}

const LIST_LIMIT = 500;
const ALL_LIST_LIMIT = 300;

const RECORD_COLOR_BY_VALUE: Record<HighlightColorValue, HighlightColor> = {
  yellow: HighlightColor.YELLOW,
  green: HighlightColor.GREEN,
  blue: HighlightColor.BLUE,
  pink: HighlightColor.PINK,
};

const VALUE_BY_RECORD_COLOR: Record<HighlightColor, HighlightColorValue> = {
  [HighlightColor.YELLOW]: 'yellow',
  [HighlightColor.GREEN]: 'green',
  [HighlightColor.BLUE]: 'blue',
  [HighlightColor.PINK]: 'pink',
};

export class HighlightColorMapper {
  static toRecord(color: HighlightColorValue): HighlightColor {
    return RECORD_COLOR_BY_VALUE[color];
  }

  static toValue(color: HighlightColor): HighlightColorValue {
    return VALUE_BY_RECORD_COLOR[color];
  }
}

function buildWhere(bookId: string | undefined, filters: HighlightFilters) {
  return {
    ...(bookId !== undefined ? { bookId } : {}),
    ...(filters.color !== undefined ? { color: filters.color } : {}),
    ...(filters.query !== undefined
      ? {
          quote: { contains: filters.query, mode: 'insensitive' as const },
        }
      : {}),
  };
}

@Injectable()
export class HighlightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    bookId: string,
    filters: HighlightFilters = {},
  ): Promise<Highlight[]> {
    return this.prisma.highlight.findMany({
      where: buildWhere(bookId, filters),
      orderBy: [{ chapterPosition: 'asc' }, { startOffset: 'asc' }],
      take: LIST_LIMIT,
    });
  }

  async listAll(
    filters: HighlightFilters = {},
    bookId?: string,
    limit = ALL_LIST_LIMIT,
  ): Promise<HighlightWithBookRecord[]> {
    return this.prisma.highlight.findMany({
      where: buildWhere(bookId, filters),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        book: {
          select: { id: true, title: true, author: true },
        },
      },
    });
  }

  async findById(
    bookId: string,
    highlightId: string,
  ): Promise<Highlight | null> {
    return this.prisma.highlight.findFirst({
      where: { id: highlightId, bookId },
    });
  }

  async findChapterText(
    bookId: string,
    chapterPosition: number,
  ): Promise<string | null> {
    const chapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_position: { bookId, position: chapterPosition },
      },
      select: { text: true },
    });

    return chapter?.text ?? null;
  }

  async findOverlapping(
    bookId: string,
    chapterPosition: number,
    startOffset: number,
    endOffset: number,
  ): Promise<Highlight | null> {
    return this.prisma.highlight.findFirst({
      where: {
        bookId,
        chapterPosition,
        startOffset: { lt: endOffset },
        endOffset: { gt: startOffset },
      },
    });
  }

  async create(
    bookId: string,
    input: CreateHighlightRecord,
  ): Promise<Highlight> {
    return this.prisma.highlight.create({
      data: {
        bookId,
        chapterPosition: input.chapterPosition,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        quote: input.quote,
        color: input.color,
      },
    });
  }

  async updateColor(
    highlightId: string,
    color: HighlightColor,
  ): Promise<Highlight> {
    return this.prisma.highlight.update({
      where: { id: highlightId },
      data: { color },
    });
  }

  async delete(highlightId: string): Promise<void> {
    await this.prisma.highlight.delete({ where: { id: highlightId } });
  }
}
