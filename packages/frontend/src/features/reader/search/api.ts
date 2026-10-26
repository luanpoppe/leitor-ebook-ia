import { api } from "@/utils/http";

export interface BookSearchItem {
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
  snippet: string;
  rank: number;
}

interface BookSearchResponse {
  items: BookSearchItem[];
}

export async function searchBook(
  bookId: string,
  query: string,
  limit = 12
): Promise<BookSearchItem[]> {
  const response = await api.get<BookSearchResponse>(
    `/ebooks/${bookId}/search`,
    { params: { q: query, limit } }
  );

  return response.data.items;
}
