import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const FIRST_OFFSET = 0;
const DEFAULT_CHAPTER_PAGE_SIZE = 50_000;
const MAX_CHAPTER_PAGE_SIZE = 100_000;

export const chapterPositionParamsSchema = z.object({
  position: z.coerce.number().int().min(1),
});

export class ChapterPositionParamsDto extends createZodDto(
  chapterPositionParamsSchema,
) {}

export const chapterPageQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(FIRST_OFFSET),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CHAPTER_PAGE_SIZE)
    .default(DEFAULT_CHAPTER_PAGE_SIZE),
});

export class ChapterPageQueryDto extends createZodDto(chapterPageQuerySchema) {}

export interface ChapterSummaryResponse {
  id: string;
  position: number;
  title: string | null;
  wordCount: number;
}

export interface ChapterListResponse {
  items: ChapterSummaryResponse[];
}

export interface ChapterContentResponse {
  id: string;
  position: number;
  title: string | null;
  text: string;
  offset: number;
  limit: number;
  nextOffset: number | null;
  totalLength: number;
  previousPosition: number | null;
  nextPosition: number | null;
}
