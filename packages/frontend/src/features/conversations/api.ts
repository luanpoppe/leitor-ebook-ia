import { api } from "@/utils/http";
import type { ChatMessage } from "@/features/reader/chat/types";

export interface BookConversationSummary {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface BookConversationDetail {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  title: string | null;
  updatedAt: string;
  messages: ChatMessage[];
}

interface BookConversationListResponse {
  items: BookConversationSummary[];
}

export async function listAllConversations(): Promise<
  BookConversationSummary[]
> {
  const response = await api.get<BookConversationListResponse>("/conversations");

  return response.data.items;
}

export async function getConversationDetail(
  conversationId: string
): Promise<BookConversationDetail> {
  const response = await api.get<BookConversationDetail>(
    `/conversations/${conversationId}`
  );

  return response.data;
}
