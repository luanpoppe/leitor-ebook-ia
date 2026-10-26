export type ChatRole = "USER" | "ASSISTANT";

export type ChatScope = "up-to-current" | "whole-book";

export interface ChatCitation {
  /** Número que aparece na resposta, entre colchetes. */
  index: number;
  chapterPosition: number;
  chapterTitle: string | null;
  /** Offset do trecho dentro do capítulo, para o leitor pular até ele. */
  offset: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Trecho selecionado que a pergunta usou como foco (mensagens USER). */
  selection: string | null;
  citations: ChatCitation[];
  createdAt: string;
}

/** Seleção ativa no painel: o foco da próxima pergunta. */
export interface ChatSelection {
  text: string;
  before: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation {
  id: string;
  title: string | null;
  messages: ChatMessage[];
}

export interface AskQuestionInput {
  question: string;
  scope: ChatScope;
  position: number;
  offset: number;
  /** Faixa da leitura atual (página atual e duas anteriores). */
  contextStart: number;
  contextEnd: number;
  /** Trecho selecionado pelo leitor: foco da pergunta. */
  selection?: string;
  /** Texto imediatamente anterior à seleção. */
  selectionBefore?: string;
}

export interface AskQuestionResponse {
  conversationId: string;
  messages: ChatMessage[];
}
