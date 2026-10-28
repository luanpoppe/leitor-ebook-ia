"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type BookNote,
  type NoteInput,
} from "./api";

export interface UseNotesResult {
  notes: BookNote[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
  create(input: NoteInput): Promise<BookNote>;
  update(noteId: string, input: NoteInput): Promise<BookNote>;
  remove(noteId: string): Promise<void>;
}

/** Anotações do livro, carregadas ao abrir o painel. */
export function useNotes(bookId: string): UseNotesResult {
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedNotes = await listNotes(bookId);
      setNotes(loadedNotes);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const reload = useCallback(() => {
    void loadNotes();
  }, [loadNotes]);

  const create = useCallback(
    async (input: NoteInput): Promise<BookNote> => {
      const note = await createNote(bookId, input);
      setNotes((currentNotes) => [note, ...currentNotes]);

      return note;
    },
    [bookId]
  );

  const update = useCallback(
    async (noteId: string, input: NoteInput): Promise<BookNote> => {
      const note = await updateNote(bookId, noteId, input);
      setNotes((currentNotes) => [
        note,
        ...currentNotes.filter((currentNote) => currentNote.id !== noteId),
      ]);

      return note;
    },
    [bookId]
  );

  const remove = useCallback(
    async (noteId: string): Promise<void> => {
      await deleteNote(bookId, noteId);
      setNotes((currentNotes) =>
        currentNotes.filter((currentNote) => currentNote.id !== noteId)
      );
    },
    [bookId]
  );

  return { notes, isLoading, error, reload, create, update, remove };
}
