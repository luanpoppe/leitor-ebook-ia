/**
 * Erros de domínio da fila de ingestão de ebooks.
 * A camada que enfileira decide como traduzir a falha para o usuário;
 * a fila em si não cria job fantasma quando o Redis está ausente.
 */

export class QueueUnavailableError extends Error {
  constructor(message = 'A fila de ingestão está indisponível.') {
    super(message);
    this.name = 'QueueUnavailableError';
  }
}
