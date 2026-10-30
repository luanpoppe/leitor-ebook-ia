import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const conversationParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

export class ConversationParamsDto extends createZodDto(
  conversationParamsSchema,
) {}

export const askQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  scope: z.enum(['up-to-current', 'whole-book']).default('up-to-current'),
  position: z.coerce.number().int().min(1).default(1),
  offset: z.coerce.number().int().min(0).default(0),
  /** Início do texto que o leitor está vendo (página atual e as duas anteriores). */
  contextStart: z.coerce.number().int().min(0).optional(),
  /** Fim do texto visível. */
  contextEnd: z.coerce.number().int().min(0).optional(),
  /** Trecho selecionado pelo leitor; a pergunta é sobre ele. */
  selection: z.string().trim().min(1).max(4_000).optional(),
  /** Texto imediatamente anterior à seleção. */
  selectionBefore: z.string().trim().max(2_000).optional(),
});

export class AskQuestionDto extends createZodDto(askQuestionSchema) {}

export type ChatScope = z.infer<typeof askQuestionSchema>['scope'];

export interface ChatCitationResponse {
  index: number;
  chapterPosition: number;
  chapterTitle: string | null;
  /** Offset do trecho dentro do capítulo, para o leitor pular até ele. */
  offset: number;
}

export interface ChatNoteActionResponse {
  noteId: string;
  title: string;
  action: 'created' | 'updated';
}

export interface ChatMessageResponse {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  /** Trecho do livro que a pergunta usou como foco (só em mensagens USER). */
  selection: string | null;
  /** URL relativa da imagem gerada (só em mensagens ASSISTANT). */
  imageUrl: string | null;
  citations: ChatCitationResponse[];
  /** Anotações criadas/editadas por ferramentas nesta resposta. */
  noteActions: ChatNoteActionResponse[];
  createdAt: string;
}

export interface ConversationSummaryResponse {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationListResponse {
  items: ConversationSummaryResponse[];
}

export interface ConversationWithBookResponse {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationListWithBooksResponse {
  items: ConversationWithBookResponse[];
}

export interface ConversationDetailWithBookResponse {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  title: string | null;
  updatedAt: string;
  messages: ChatMessageResponse[];
}

export interface ConversationResponse {
  id: string;
  title: string | null;
  messages: ChatMessageResponse[];
}

export interface AskQuestionResponse {
  conversationId: string;
  /** Mensagem da pergunta e resposta da IA, na ordem. */
  messages: ChatMessageResponse[];
}
