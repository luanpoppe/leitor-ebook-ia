/**
 * Erros de domínio das marcações de texto do leitor.
 */
export class HighlightNotFoundError extends Error {
  readonly bookId: string;
  readonly highlightId: string;

  constructor(bookId: string, highlightId: string) {
    super(`Marcação não encontrada: ${highlightId}.`);
    this.name = 'HighlightNotFoundError';
    this.bookId = bookId;
    this.highlightId = highlightId;
  }
}

export class InvalidHighlightChapterError extends Error {
  readonly bookId: string;
  readonly chapterPosition: number;

  constructor(bookId: string, chapterPosition: number) {
    super(`O capítulo ${chapterPosition} não existe no ebook ${bookId}.`);
    this.name = 'InvalidHighlightChapterError';
    this.bookId = bookId;
    this.chapterPosition = chapterPosition;
  }
}

export class InvalidHighlightRangeError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidHighlightRangeError';
    this.reason = reason;
  }
}

export class HighlightOverlapError extends Error {
  readonly bookId: string;
  readonly chapterPosition: number;

  constructor(bookId: string, chapterPosition: number) {
    super('Já existe uma marcação nesse trecho. Remova a marcação antiga ou escolha outro trecho.');
    this.name = 'HighlightOverlapError';
    this.bookId = bookId;
    this.chapterPosition = chapterPosition;
  }
}
