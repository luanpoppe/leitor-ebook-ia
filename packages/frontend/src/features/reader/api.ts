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

async function fetchChapterPage(
  bookId: string,
  position: number,
  offset: number
): Promise<ChapterPage> {
  const path = `/ebooks/${bookId}/chapters/${position}`;
  const params = { offset, limit: CHAPTER_TEXT_LIMIT };
  const response = await api.get<ChapterPage>(path, { params });
  return response.data;
}

// A API devolve o capítulo em páginas; a leitura precisa do texto inteiro para
// que a rolagem e o progresso cubram o capítulo todo.
export async function getFullChapter(
  bookId: string,
  position: number
): Promise<ChapterPage> {
  const firstPage = await fetchChapterPage(bookId, position, 0);
  const collectedText: string[] = [firstPage.text];
  let lastPage = firstPage;
  let nextOffset = firstPage.nextOffset;

  while (nextOffset !== null) {
    const requestedOffset = nextOffset;
    const page = await fetchChapterPage(bookId, position, requestedOffset);
    collectedText.push(page.text);
    lastPage = page;
    nextOffset = page.nextOffset;

    // Se o backend repetir o mesmo offset, parar evita loop infinito.
    const didOffsetAdvance = nextOffset !== requestedOffset;
    if (!didOffsetAdvance) break;
  }

  const text = collectedText.join("");
  return {
    ...firstPage,
    text,
    offset: 0,
    limit: text.length,
    nextOffset: null,
    totalLength: lastPage.totalLength,
  };
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
