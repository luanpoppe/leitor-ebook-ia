import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColorValue = (typeof HIGHLIGHT_COLORS)[number];

export const MAX_HIGHLIGHT_QUOTE_LENGTH = 4_000;

export const highlightColorSchema = z.enum(HIGHLIGHT_COLORS);

export const highlightParamsSchema = z.object({
  highlightId: z.string().uuid(),
});

export class HighlightParamsDto extends createZodDto(highlightParamsSchema) {}

export const listHighlightsQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  color: highlightColorSchema.optional(),
});

export class ListHighlightsQueryDto extends createZodDto(
  listHighlightsQuerySchema,
) {}

export const allHighlightsQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  bookId: z.string().uuid().optional(),
  color: highlightColorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

export class AllHighlightsQueryDto extends createZodDto(
  allHighlightsQuerySchema,
) {}

export const createHighlightSchema = z
  .object({
    chapterPosition: z.number().int().min(1),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    color: highlightColorSchema,
  })
  .refine((input) => input.endOffset > input.startOffset, {
    message: 'O fim da marcação precisa ser depois do início.',
    path: ['endOffset'],
  });

export class CreateHighlightDto extends createZodDto(createHighlightSchema) {}

export const updateHighlightSchema = z.object({
  color: highlightColorSchema,
});

export class UpdateHighlightDto extends createZodDto(updateHighlightSchema) {}

export interface HighlightResponse {
  id: string;
  bookId: string;
  chapterPosition: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  color: HighlightColorValue;
  createdAt: string;
  updatedAt: string;
}

export interface HighlightListResponse {
  items: HighlightResponse[];
}

export interface HighlightBookResponse {
  id: string;
  title: string;
  author: string | null;
}

export interface HighlightWithBookResponse extends HighlightResponse {
  book: HighlightBookResponse;
}

export interface HighlightListWithBooksResponse {
  items: HighlightWithBookResponse[];
}

export type CreateHighlightInput = z.infer<typeof createHighlightSchema>;
export type UpdateHighlightInput = z.infer<typeof updateHighlightSchema>;
export type ListHighlightsQuery = z.infer<typeof listHighlightsQuerySchema>;
