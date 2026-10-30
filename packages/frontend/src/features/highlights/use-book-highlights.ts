"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  createHighlight,
  deleteHighlight,
  listBookHighlights,
  updateHighlightColor,
  type BookHighlight,
  type HighlightColor,
  type HighlightInput,
} from "./api";

export interface UseBookHighlightsResult {
  highlights: BookHighlight[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
  create(input: HighlightInput): Promise<BookHighlight>;
  updateColor(
    highlightId: string,
    color: HighlightColor
  ): Promise<BookHighlight>;
  remove(highlightId: string): Promise<void>;
}

/** Marcações do livro, carregadas ao abrir o leitor. */
export function useBookHighlights(bookId: string): UseBookHighlightsResult {
  const [highlights, setHighlights] = useState<BookHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedHighlights = await listBookHighlights(bookId);
      setHighlights(sortByPosition(loadedHighlights));
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  const reload = useCallback(() => {
    void loadHighlights();
  }, [loadHighlights]);

  const create = useCallback(
    async (input: HighlightInput): Promise<BookHighlight> => {
      const highlight = await createHighlight(bookId, input);
      setHighlights((current) => sortByPosition([...current, highlight]));

      return highlight;
    },
    [bookId]
  );

  const updateColor = useCallback(
    async (
      highlightId: string,
      color: HighlightColor
    ): Promise<BookHighlight> => {
      const highlight = await updateHighlightColor(
        bookId,
        highlightId,
        color
      );
      setHighlights((current) =>
        current.map((item) => (item.id === highlightId ? highlight : item))
      );

      return highlight;
    },
    [bookId]
  );

  const remove = useCallback(
    async (highlightId: string): Promise<void> => {
      await deleteHighlight(bookId, highlightId);
      setHighlights((current) =>
        current.filter((highlight) => highlight.id !== highlightId)
      );
    },
    [bookId]
  );

  return { highlights, isLoading, error, reload, create, updateColor, remove };
}

function sortByPosition(highlights: BookHighlight[]): BookHighlight[] {
  return [...highlights].sort((left, right) => {
    if (left.chapterPosition !== right.chapterPosition) {
      return left.chapterPosition - right.chapterPosition;
    }

    return left.startOffset - right.startOffset;
  });
}
