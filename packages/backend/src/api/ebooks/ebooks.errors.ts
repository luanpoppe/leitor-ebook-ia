/**
 * Erros de domínio da API de ebooks.
 * O filtro HTTP (`ebooks-exception.filter.ts`) traduz cada um para um status.
 */

export class UnsupportedEbookFormatError extends Error {
  constructor(message = 'Formato não suportado. Envie EPUB, PDF, TXT ou MD.') {
    super(message);
    this.name = 'UnsupportedEbookFormatError';
  }
}

export class EmptyEbookFileError extends Error {
  constructor(message = 'O arquivo enviado está vazio.') {
    super(message);
    this.name = 'EmptyEbookFileError';
  }
}

export class InvalidEbookStatusError extends Error {
  readonly status: string;

  constructor(status: string) {
    super('Só é possível reprocessar um ebook que falhou.');
    this.name = 'InvalidEbookStatusError';
    this.status = status;
  }
}
