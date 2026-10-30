/**
 * Erros de domínio do dicionário pessoal.
 */
export class InvalidDictionaryWordError extends Error {
  constructor() {
    super('Informe uma palavra válida para o dicionário.');
    this.name = 'InvalidDictionaryWordError';
  }
}

export class InvalidDictionaryChapterError extends Error {
  readonly bookId: string;
  readonly chapterPosition: number;

  constructor(bookId: string, chapterPosition: number) {
    super(`O capítulo ${chapterPosition} não existe no ebook ${bookId}.`);
    this.name = 'InvalidDictionaryChapterError';
    this.bookId = bookId;
    this.chapterPosition = chapterPosition;
  }
}
