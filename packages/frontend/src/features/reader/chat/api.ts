import { api } from "@/utils/http";
import type {
  AskQuestionInput,
  AskQuestionResponse,
  Conversation,
  ConversationSummary,
} from "./types";

interface ConversationListResponse {
  items: ConversationSummary[];
}

function conversationPath(bookId: string): string {
  return `/ebooks/${bookId}/conversations`;
}

export async function listConversations(
  bookId: string
): Promise<ConversationSummary[]> {
  const path = conversationPath(bookId);
  const response = await api.get<ConversationListResponse>(path);
  return response.data.items;
}

export async function createConversation(
  bookId: string
): Promise<Conversation> {
  const path = conversationPath(bookId);
  const response = await api.post<Conversation>(path);
  return response.data;
}

export async function getConversation(
  bookId: string,
  conversationId: string
): Promise<Conversation> {
  const path = `${conversationPath(bookId)}/${conversationId}`;
  const response = await api.get<Conversation>(path);
  return response.data;
}

export async function deleteConversation(
  bookId: string,
  conversationId: string
): Promise<void> {
  const path = `${conversationPath(bookId)}/${conversationId}`;
  await api.delete(path);
}

export async function askQuestion(
  bookId: string,
  conversationId: string,
  input: AskQuestionInput
): Promise<AskQuestionResponse> {
  const path = `${conversationPath(bookId)}/${conversationId}/messages`;
  const response = await api.post<AskQuestionResponse>(path, input);
  return response.data;
}
