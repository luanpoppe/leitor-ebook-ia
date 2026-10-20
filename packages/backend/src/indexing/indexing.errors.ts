/**
 * Erros de domínio da indexação de ebooks (chunking e embeddings).
 * Camadas superiores (services/jobs) decidem entre preservar o parcial e
 * marcar o livro como `failed`.
 */

export class EmbeddingUnavailableError extends Error {
  readonly cause?: Error;

  constructor(
    message = 'Não foi possível gerar os embeddings do ebook.',
    cause?: Error,
  ) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
    this.cause = cause;
  }
}
