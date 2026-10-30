import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listDictionaryQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  bookId: z.string().uuid().optional(),
});

export class ListDictionaryQueryDto extends createZodDto(
  listDictionaryQuerySchema,
) {}

export const dictionaryEntryParamsSchema = z.object({
  entryId: z.string().uuid(),
});

export class DictionaryEntryParamsDto extends createZodDto(
  dictionaryEntryParamsSchema,
) {}

export interface DictionaryBookResponse {
  id: string;
  title: string;
  author: string | null;
}

export interface DictionaryEntryResponse {
  id: string;
  word: string;
  meaning: string;
  example: string | null;
  quote: string | null;
  chapterPosition: number | null;
  book: DictionaryBookResponse | null;
  /** URL relativa da imagem gerada para a palavra, se houver. */
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryListResponse {
  items: DictionaryEntryResponse[];
}

export interface SaveDictionaryInput {
  bookId: string;
  word: string;
  meaning: string;
  example?: string | null;
  quote?: string | null;
  chapterPosition?: number | null;
}
