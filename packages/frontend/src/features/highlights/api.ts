import { api } from "@/utils/http";

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface BookHighlight {
  id: string;
  bookId: string;
  chapterPosition: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  color: HighlightColor;
  createdAt: string;
  updatedAt: string;
}

export interface HighlightBook {
  id: string;
  title: string;
  author: string | null;
}

export interface AllBookHighlight extends BookHighlight {
  book: HighlightBook;
}

export interface HighlightInput {
  chapterPosition: number;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
}

interface HighlightListResponse {
  items: BookHighlight[];
}

interface AllHighlightsResponse {
  items: AllBookHighlight[];
}

export async function listBookHighlights(
  bookId: string
): Promise<BookHighlight[]> {
  const response = await api.get<HighlightListResponse>(
    `/ebooks/${bookId}/highlights`
  );

  return response.data.items;
}

export async function listAllHighlights(): Promise<AllBookHighlight[]> {
  const response = await api.get<AllHighlightsResponse>("/highlights");

  return response.data.items;
}

export async function createHighlight(
  bookId: string,
  input: HighlightInput
): Promise<BookHighlight> {
  const response = await api.post<BookHighlight>(
    `/ebooks/${bookId}/highlights`,
    input
  );

  return response.data;
}

export async function updateHighlightColor(
  bookId: string,
  highlightId: string,
  color: HighlightColor
): Promise<BookHighlight> {
  const response = await api.patch<BookHighlight>(
    `/ebooks/${bookId}/highlights/${highlightId}`,
    { color }
  );

  return response.data;
}

export async function deleteHighlight(
  bookId: string,
  highlightId: string
): Promise<void> {
  await api.delete(`/ebooks/${bookId}/highlights/${highlightId}`);
}
