import { api } from "@/utils/http";

export interface BookImage {
  id: string;
  prompt: string;
  model: string;
  createdAt: string;
  /** URL relativa servida pelo backend. */
  url: string;
}

interface BookImageListResponse {
  items: BookImage[];
}

export async function listBookImages(bookId: string): Promise<BookImage[]> {
  const response = await api.get<BookImageListResponse>(
    `/ebooks/${bookId}/images`
  );

  return response.data.items;
}
