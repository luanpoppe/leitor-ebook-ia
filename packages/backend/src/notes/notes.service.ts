import { Injectable, Logger } from '@nestjs/common';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { Note } from '../generated/prisma/client';
import { InvalidNoteChapterError, NoteNotFoundError } from './notes.errors';
import {
  NotesRepository,
  type CreateNoteRecord,
  type UpdateNoteRecord,
} from './notes.repository';
import type {
  CreateNoteInput,
  NoteResponse,
  UpdateNoteInput,
} from './notes.schemas';

/**
 * Regras das anotações do leitor: sempre no escopo de um livro e, quando a
 * nota aponta para um capítulo, o capítulo precisa existir naquele livro.
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly notes: NotesRepository,
    private readonly ebooks: EbookRepository,
  ) {}

  async list(bookId: string, query?: string): Promise<NoteResponse[]> {
    await this.requireBook(bookId);
    const notes = await this.notes.list(bookId, query);

    return notes.map((note) => this.toResponse(note));
  }

  async get(bookId: string, noteId: string): Promise<NoteResponse> {
    await this.requireBook(bookId);
    const note = await this.notes.findById(bookId, noteId);
    if (note === null) throw new NoteNotFoundError(bookId, noteId);

    return this.toResponse(note);
  }

  async create(bookId: string, input: CreateNoteInput): Promise<NoteResponse> {
    await this.requireBook(bookId);
    const chapterPosition = input.chapterPosition ?? null;
    await this.assertChapter(bookId, chapterPosition);

    const record: CreateNoteRecord = {
      title: input.title,
      content: input.content,
      chapterPosition,
    };
    const note = await this.notes.create(bookId, record);

    this.logger.log(
      `Anotação criada: bookId=${bookId}, noteId=${note.id}, capítulo=${chapterPosition ?? '-'}.`,
    );

    return this.toResponse(note);
  }

  async update(
    bookId: string,
    noteId: string,
    input: UpdateNoteInput,
  ): Promise<NoteResponse> {
    await this.requireBook(bookId);
    const existing = await this.notes.findById(bookId, noteId);
    if (existing === null) throw new NoteNotFoundError(bookId, noteId);

    if (input.chapterPosition !== undefined) {
      await this.assertChapter(bookId, input.chapterPosition);
    }

    const record: UpdateNoteRecord = {};
    if (input.title !== undefined) record.title = input.title;
    if (input.content !== undefined) record.content = input.content;
    if (input.chapterPosition !== undefined) {
      record.chapterPosition = input.chapterPosition;
    }

    const note = await this.notes.update(noteId, record);

    this.logger.log(`Anotação atualizada: bookId=${bookId}, noteId=${noteId}.`);

    return this.toResponse(note);
  }

  async remove(bookId: string, noteId: string): Promise<void> {
    await this.requireBook(bookId);
    const existing = await this.notes.findById(bookId, noteId);
    if (existing === null) throw new NoteNotFoundError(bookId, noteId);

    await this.notes.delete(noteId);

    this.logger.log(`Anotação excluída: bookId=${bookId}, noteId=${noteId}.`);
  }

  private async requireBook(bookId: string): Promise<void> {
    const book = await this.ebooks.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);
  }

  private async assertChapter(
    bookId: string,
    chapterPosition: number | null,
  ): Promise<void> {
    if (chapterPosition === null) return;

    const exists = await this.notes.chapterExists(bookId, chapterPosition);
    if (!exists) throw new InvalidNoteChapterError(bookId, chapterPosition);
  }

  private toResponse(note: Note): NoteResponse {
    return {
      id: note.id,
      title: note.title,
      content: note.content,
      chapterPosition: note.chapterPosition,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}
