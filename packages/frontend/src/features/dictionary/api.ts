import { api } from "@/utils/http";

export interface DictionaryBook {
  id: string;
  title: string;
  author: string | null;
}

export interface DictionaryEntry {
  id: string;
  word: string;
  meaning: string;
  example: string | null;
  quote: string | null;
  chapterPosition: number | null;
  book: DictionaryBook | null;
  createdAt: string;
  updatedAt: string;
}

interface DictionaryListResponse {
  items: DictionaryEntry[];
}

export async function listDictionary(): Promise<DictionaryEntry[]> {
  const response = await api.get<DictionaryListResponse>("/dictionary");

  return response.data.items;
}
