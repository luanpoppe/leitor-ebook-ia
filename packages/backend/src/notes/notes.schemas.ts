import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MAX_NOTE_TITLE_LENGTH = 120;
export const MAX_NOTE_CONTENT_LENGTH = 20_000;

export const noteParamsSchema = z.object({
  noteId: z.string().uuid(),
});

export class NoteParamsDto extends createZodDto(noteParamsSchema) {}

export const listNotesQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
});

export class ListNotesQueryDto extends createZodDto(listNotesQuerySchema) {}

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(MAX_NOTE_TITLE_LENGTH),
  content: z.string().trim().min(1).max(MAX_NOTE_CONTENT_LENGTH),
  chapterPosition: z.number().int().min(1).nullable().optional(),
});

export class CreateNoteDto extends createZodDto(createNoteSchema) {}

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_NOTE_TITLE_LENGTH).optional(),
    content: z.string().trim().min(1).max(MAX_NOTE_CONTENT_LENGTH).optional(),
    chapterPosition: z.number().int().min(1).nullable().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.content !== undefined ||
      input.chapterPosition !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  );

export class UpdateNoteDto extends createZodDto(updateNoteSchema) {}

export interface NoteResponse {
  id: string;
  title: string;
  content: string;
  chapterPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  items: NoteResponse[];
}

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
