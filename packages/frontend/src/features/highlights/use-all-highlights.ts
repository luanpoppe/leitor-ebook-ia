"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  deleteHighlight,
  listAllHighlights,
  type AllBookHighlight,
} from "./api";

export interface UseAllHighlightsResult {
  highlights: AllBookHighlight[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
  remove(bookId: string, highlightId: string): Promise<void>;
}

/** Todas as marcações da biblioteca, para a página global. */
export function useAllHighlights(): UseAllHighlightsResult {
  const [highlights, setHighlights] = useState<AllBookHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedHighlights = await listAllHighlights();
      setHighlights(loadedHighlights);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  const reload = useCallback(() => {
    void loadHighlights();
  }, [loadHighlights]);

  const remove = useCallback(
    async (bookId: string, highlightId: string): Promise<void> => {
      await deleteHighlight(bookId, highlightId);
      setHighlights((current) =>
        current.filter((highlight) => highlight.id !== highlightId)
      );
    },
    []
  );

  return { highlights, isLoading, error, reload, remove };
}
