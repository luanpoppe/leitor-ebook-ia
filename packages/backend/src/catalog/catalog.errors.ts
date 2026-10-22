/**
 * Erros de domínio do catálogo de ebooks.
 * Camadas superiores (services/controllers) traduzem estes erros para HTTP.
 */

export class DuplicateEbookError extends Error {
  readonly existingBookId: string;

  constructor(existingBookId: string) {
    super(
      `Já existe um ebook cadastrado com este conteúdo (id existente: ${existingBookId}).`,
    );
    this.name = 'DuplicateEbookError';
    this.existingBookId = existingBookId;
  }
}

export class EbookNotFoundError extends Error {
  readonly bookId: string;

  constructor(bookId: string) {
    super(`Ebook não encontrado: ${bookId}.`);
    this.name = 'EbookNotFoundError';
    this.bookId = bookId;
  }
}

export class InvalidEbookContentError extends Error {
  constructor(message = 'O conteúdo extraído do ebook está vazio.') {
    super(message);
    this.name = 'InvalidEbookContentError';
  }
}

export class InvalidEbookInputError extends Error {
  constructor(message = 'Os dados do ebook são inválidos.') {
    super(message);
    this.name = 'InvalidEbookInputError';
  }
}

export class ChapterNotFoundError extends Error {
  readonly bookId: string;
  readonly position: number;

  constructor(bookId: string, position: number) {
    super(`Capítulo ${position} não encontrado no ebook ${bookId}.`);
    this.name = 'ChapterNotFoundError';
    this.bookId = bookId;
    this.position = position;
  }
}

export class InvalidReadingProgressError extends Error {
  readonly bookId: string;
  readonly chapterPosition: number;
  readonly offset: number;
  readonly chapterLength: number;

  constructor(
    bookId: string,
    chapterPosition: number,
    offset: number,
    chapterLength: number,
  ) {
    super(
      `Offset ${offset} excede o capítulo ${chapterPosition} do ebook ${bookId} (${chapterLength} caracteres).`,
    );
    this.name = 'InvalidReadingProgressError';
    this.bookId = bookId;
    this.chapterPosition = chapterPosition;
    this.offset = offset;
    this.chapterLength = chapterLength;
  }
}

export class EbookNotReadyError extends Error {
  readonly bookId: string;
  readonly status: string;

  constructor(bookId: string, status: string) {
    super(
      `O ebook ${bookId} ainda não está pronto para leitura (status: ${status}).`,
    );
    this.name = 'EbookNotReadyError';
    this.bookId = bookId;
    this.status = status;
  }
}
