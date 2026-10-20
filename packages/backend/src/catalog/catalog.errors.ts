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
