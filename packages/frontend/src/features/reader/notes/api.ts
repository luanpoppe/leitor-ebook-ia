import { api } from "@/utils/http";

export interface BookNote {
  id: string;
  title: string;
  content: string;
  chapterPosition: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  content: string;
  chapterPosition: number | null;
}

export interface NoteBook {
  id: string;
  title: string;
  author: string | null;
}

export interface AllBookNote extends BookNote {
  book: NoteBook;
}

interface NoteListResponse {
  items: BookNote[];
}

interface AllNotesResponse {
  items: AllBookNote[];
}

export async function listAllNotes(): Promise<AllBookNote[]> {
  const response = await api.get<AllNotesResponse>("/notes");

  return response.data.items;
}

export async function listNotes(bookId: string): Promise<BookNote[]> {
  const response = await api.get<NoteListResponse>(
    `/ebooks/${bookId}/notes`
  );

  return response.data.items;
}

export async function createNote(
  bookId: string,
  input: NoteInput
): Promise<BookNote> {
  const response = await api.post<BookNote>(`/ebooks/${bookId}/notes`, input);

  return response.data;
}

export async function updateNote(
  bookId: string,
  noteId: string,
  input: NoteInput
): Promise<BookNote> {
  const response = await api.patch<BookNote>(
    `/ebooks/${bookId}/notes/${noteId}`,
    input
  );

  return response.data;
}

export async function deleteNote(
  bookId: string,
  noteId: string
): Promise<void> {
  await api.delete(`/ebooks/${bookId}/notes/${noteId}`);
}
