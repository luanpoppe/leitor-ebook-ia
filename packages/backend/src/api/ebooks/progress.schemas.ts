import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Teto do int4 do Postgres, usado nos parâmetros numéricos do SQL.
const MAX_DATABASE_INTEGER = 2_147_483_647;

// O corpo é JSON, então não há `coerce` como nos params/query.
export const saveReadingProgressSchema = z.object({
  chapterPosition: z.number().int().min(1).max(MAX_DATABASE_INTEGER),
  offset: z.number().int().min(0).max(MAX_DATABASE_INTEGER),
});

export class SaveReadingProgressDto extends createZodDto(
  saveReadingProgressSchema,
) {}

export interface ReadingProgressResponse {
  bookId: string;
  chapterPosition: number;
  offset: number;
  updatedAt: string;
}
