import { Injectable } from '@nestjs/common';
import { DictionaryEntry } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';

export interface DictionaryEntryWithBook extends DictionaryEntry {
  book: {
    id: string;
    title: string;
    author: string | null;
  } | null;
}

export interface CreateDictionaryRecord {
  word: string;
  normalizedWord: string;
  meaning: string;
  example: string | null;
  quote: string | null;
  bookId: string;
  chapterPosition: number | null;
}

export interface UpdateDictionaryRecord {
  word: string;
  meaning: string;
  example: string | null;
  quote: string | null;
  bookId: string;
  chapterPosition: number | null;
}

const LIST_LIMIT = 500;

const BOOK_SELECT = {
  book: {
    select: { id: true, title: true, author: true },
  },
} as const;

function buildWhere(query?: string, bookId?: string) {
  return {
    ...(bookId !== undefined ? { bookId } : {}),
    ...(query !== undefined
      ? {
          OR: [
            { word: { contains: query, mode: 'insensitive' as const } },
            { meaning: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

@Injectable()
export class DictionaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query?: string,
    bookId?: string,
  ): Promise<DictionaryEntryWithBook[]> {
    return this.prisma.dictionaryEntry.findMany({
      where: buildWhere(query, bookId),
      orderBy: { word: 'asc' },
      take: LIST_LIMIT,
      include: BOOK_SELECT,
    });
  }

  async findByNormalizedWord(
    normalizedWord: string,
  ): Promise<DictionaryEntryWithBook | null> {
    return this.prisma.dictionaryEntry.findUnique({
      where: { normalizedWord },
      include: BOOK_SELECT,
    });
  }

  async findById(id: string): Promise<DictionaryEntry | null> {
    return this.prisma.dictionaryEntry.findUnique({ where: { id } });
  }

  async attachImage(
    id: string,
    imageId: string,
  ): Promise<DictionaryEntryWithBook> {
    return this.prisma.dictionaryEntry.update({
      where: { id },
      data: { imageId },
      include: BOOK_SELECT,
    });
  }

  async create(
    input: CreateDictionaryRecord,
  ): Promise<DictionaryEntryWithBook> {
    return this.prisma.dictionaryEntry.create({
      data: {
        word: input.word,
        normalizedWord: input.normalizedWord,
        meaning: input.meaning,
        example: input.example,
        quote: input.quote,
        bookId: input.bookId,
        chapterPosition: input.chapterPosition,
      },
      include: BOOK_SELECT,
    });
  }

  async update(
    id: string,
    input: UpdateDictionaryRecord,
  ): Promise<DictionaryEntryWithBook> {
    return this.prisma.dictionaryEntry.update({
      where: { id },
      data: {
        word: input.word,
        meaning: input.meaning,
        example: input.example,
        quote: input.quote,
        bookId: input.bookId,
        chapterPosition: input.chapterPosition,
      },
      include: BOOK_SELECT,
    });
  }

  async chapterExists(bookId: string, position: number): Promise<boolean> {
    const count = await this.prisma.chapter.count({
      where: { bookId, position },
    });

    return count > 0;
  }
}
