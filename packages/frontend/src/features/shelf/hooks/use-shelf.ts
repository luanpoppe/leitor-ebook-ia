"use client";

import { useEffect, useState } from "react";
import { useEbooks } from "@/features/ebooks/use-ebooks";
import { useReprocessEbook } from "@/features/ebooks/use-reprocess-ebook";
import { ShelfStatsBuilder } from "../shelf-stats";
import type { ShelfStats } from "../shelf-stats";
import type { EbookSummary } from "@/features/ebooks/types";

const HIGHLIGHT_DURATION_MS = 4000;

const BOOK_SELECTOR = (id: string) => `[data-book-id="${id}"]`;

export interface UseShelfResult {
  ebooks: EbookSummary[];
  stats: ShelfStats;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  selectedId: string | null;
  openBook: (id: string) => void;
  closeBook: () => void;
  highlightedId: string | null;
  handleDuplicate: (existingBookId: string) => void;
  reprocess: (id: string) => void;
  isReprocessingFor: (id: string) => boolean;
}

export function useShelf(): UseShelfResult {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const {
    ebooks,
    total,
    isLoading,
    isError,
    errorMessage,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useEbooks();

  const { reprocess, isReprocessingFor } = useReprocessEbook();

  useEffect(() => {
    if (!highlightedId) return;

    const cardElement = document.querySelector(BOOK_SELECTOR(highlightedId));

    // A duplicata pode estar fora das páginas já carregadas: sem cartão na
    // tela, o detalhe é o único jeito de o usuário ver o livro existente.
    if (!cardElement) {
      setSelectedId(highlightedId);
      setHighlightedId(null);
      return;
    }

    cardElement.scrollIntoView({ behavior: "smooth", block: "center" });

    const timeoutId = window.setTimeout(() => {
      setHighlightedId(null);
    }, HIGHLIGHT_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedId]);

  const openBook = (id: string): void => {
    setSelectedId(id);
  };

  const closeBook = (): void => {
    setSelectedId(null);
  };

  const handleDuplicate = (existingBookId: string): void => {
    setHighlightedId(existingBookId);
  };

  const handleRefetch = (): void => {
    refetch();
  };

  const handleFetchNextPage = (): void => {
    fetchNextPage();
  };

  return {
    ebooks,
    stats: ShelfStatsBuilder.build(ebooks, total),
    isLoading,
    isError,
    errorMessage,
    refetch: handleRefetch,
    hasNextPage,
    fetchNextPage: handleFetchNextPage,
    isFetchingNextPage,
    selectedId,
    openBook,
    closeBook,
    highlightedId,
    handleDuplicate,
    reprocess,
    isReprocessingFor,
  };
}
