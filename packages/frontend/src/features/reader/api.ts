import { api } from "@/utils/http";
import type {
  ChapterListResponse,
  ChapterPage,
  ChapterSummary,
  ReadingProgress,
  SaveReadingProgressInput,
} from "./types";

// Teto de caracteres que a API aceita devolver em uma página de capítulo.
const CHAPTER_TEXT_LIMIT = 100_000;

export async function listChapters(
  bookId: string
): Promise<ChapterSummary[]> {
  const path = `/ebooks/${bookId}/chapters`;
  const response = await api.get<ChapterListResponse>(path);
  return response.data.items;
}

export async function getChapter(
  bookId: string,
  position: number
): Promise<ChapterPage> {
  const path = `/ebooks/${bookId}/chapters/${position}`;
  // Sem `offset`: o backend assume 0, e queremos o texto desde o início.
  const params = { limit: CHAPTER_TEXT_LIMIT };
  const response = await api.get<ChapterPage>(path, { params });
  return response.data;
}

export async function getReadingProgress(
  bookId: string
): Promise<ReadingProgress | null> {
  const path = `/ebooks/${bookId}/progress`;
  const response = await api.get<ReadingProgress | null>(path);
  // 204 vem sem corpo, então não há progresso salvo para este livro.
  const hasNoProgress = response.status === 204;
  if (hasNoProgress) return null;
  return response.data;
}

export async function saveReadingProgress(
  bookId: string,
  input: SaveReadingProgressInput
): Promise<ReadingProgress> {
  const path = `/ebooks/${bookId}/progress`;
  const response = await api.put<ReadingProgress>(path, input);
  return response.data;
}
