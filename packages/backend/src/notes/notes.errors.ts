/**
 * Erros de domínio das anotações do leitor.
 */
export class NoteNotFoundError extends Error {
  readonly bookId: string;
  readonly noteId: string;

  constructor(bookId: string, noteId: string) {
    super(`Anotação não encontrada: ${noteId}.`);
    this.name = 'NoteNotFoundError';
    this.bookId = bookId;
    this.noteId = noteId;
  }
}

export class InvalidNoteChapterError extends Error {
  readonly bookId: string;
  readonly chapterPosition: number;

  constructor(bookId: string, chapterPosition: number) {
    super(
      `O capítulo ${chapterPosition} não existe no ebook ${bookId}.`,
    );
    this.name = 'InvalidNoteChapterError';
    this.bookId = bookId;
    this.chapterPosition = chapterPosition;
  }
}
