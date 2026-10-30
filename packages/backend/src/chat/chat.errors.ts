/**
 * Erros de domínio do chat do livro.
 * O filtro HTTP (`ebooks-exception.filter.ts`) traduz cada um para um status.
 */

export class ConversationNotFoundError extends Error {
  constructor(bookId: string, conversationId: string) {
    super(`Conversa ${conversationId} não encontrada no livro ${bookId}.`);
    this.name = 'ConversationNotFoundError';
  }
}

export class ChatUnavailableError extends Error {
  constructor(
    message = 'O chat de IA está indisponível: verifique a chave OPENROUTER_API_KEY.',
  ) {
    super(message);
    this.name = 'ChatUnavailableError';
  }
}

export class ChatContextUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatContextUnavailableError';
  }
}
