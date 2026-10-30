import { api } from "@/utils/http";

export interface BookConversationSummary {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  title: string | null;
  updatedAt: string;
  messageCount: number;
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
