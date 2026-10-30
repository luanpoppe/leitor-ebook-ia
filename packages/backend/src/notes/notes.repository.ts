import { Injectable } from '@nestjs/common';
import { Note } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';

export interface CreateNoteRecord {
  title: string;
  content: string;
  chapterPosition: number | null;
}

export interface UpdateNoteRecord {
  title?: string;
  content?: string;
  chapterPosition?: number | null;
}

export interface NoteWithBookRecord extends Note {
  book: {
    id: string;
    title: string;
    author: string | null;
  };
}

const LIST_LIMIT = 200;
const ALL_LIST_LIMIT = 300;

function buildNoteSearchWhere(query?: string, bookId?: string) {
  return {
    ...(bookId !== undefined ? { bookId } : {}),
    ...(query !== undefined
      ? {
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(bookId: string, query?: string): Promise<Note[]> {
    const where = buildNoteSearchWhere(query, bookId);

    return this.prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async listAll(
    query?: string,
    bookId?: string,
    limit = ALL_LIST_LIMIT,
  ): Promise<NoteWithBookRecord[]> {
    return this.prisma.note.findMany({
      where: buildNoteSearchWhere(query, bookId),
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        book: {
          select: { id: true, title: true, author: true },
        },
      },
    });
  }

  async findById(bookId: string, noteId: string): Promise<Note | null> {
    return this.prisma.note.findFirst({
      where: { id: noteId, bookId },
    });
  }

  async create(bookId: string, input: CreateNoteRecord): Promise<Note> {
    return this.prisma.note.create({
      data: {
        bookId,
        title: input.title,
        content: input.content,
        chapterPosition: input.chapterPosition,
      },
    });
  }

  async update(noteId: string, input: UpdateNoteRecord): Promise<Note> {
    return this.prisma.note.update({
      where: { id: noteId },
      data: input,
    });
  }

  async delete(noteId: string): Promise<void> {
    await this.prisma.note.delete({ where: { id: noteId } });
  }

  async chapterExists(bookId: string, position: number): Promise<boolean> {
    const count = await this.prisma.chapter.count({
      where: { bookId, position },
    });

    return count > 0;
  }
}
