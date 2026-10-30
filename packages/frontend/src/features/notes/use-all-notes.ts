"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  listAllNotes,
  type AllBookNote,
} from "@/features/reader/notes/api";

export interface UseAllNotesResult {
  notes: AllBookNote[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
}

/** Todas as anotações da biblioteca, para a página global. */
export function useAllNotes(): UseAllNotesResult {
  const [notes, setNotes] = useState<AllBookNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedNotes = await listAllNotes();
      setNotes(loadedNotes);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const reload = useCallback(() => {
    void loadNotes();
  }, [loadNotes]);

  return { notes, isLoading, error, reload };
}
