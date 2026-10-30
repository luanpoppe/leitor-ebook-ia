import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export class SearchQueryDto extends createZodDto(searchQuerySchema) {}

export interface SearchResultItem {
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
  snippet: string;
  rank: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
}
