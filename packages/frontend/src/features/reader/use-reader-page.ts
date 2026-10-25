"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TextPage } from "./window/page-paginator";
import { useReaderWindow } from "./use-reader-window";

export type PageTurnDirection = "next" | "previous";

export interface ReaderPageMetrics {
  pageHeight: number;
  measure: (text: string) => number;
}

export interface UseReaderPageOptions {
  bookId: string;
  position: number;
  initialOffset: number;
  /** null enquanto a view ainda não mediu a área. */
  metrics: ReaderPageMetrics | null;
  enabled?: boolean;
  /** Chamado quando o leitor vira além da última página do capítulo. */
  onTurnPastEnd(): void;
  /** Chamado quando o leitor volta antes da primeira página do capítulo. */
  onTurnPastStart(): void;
  /** Offset do topo da página atual, para gravar progresso. */
  onPageChange(position: number, offset: number): void;
}

export interface UseReaderPageResult {
  page: TextPage | null;
  pageIndex: number;
  totalPages: number;
  direction: PageTurnDirection | null;
  isLoading: boolean;
  error: Error | null;
  isAtChapterStart: boolean;
  isAtChapterEnd: boolean;
  goToNextPage(): void;
  goToPreviousPage(): void;
  retry(): void;
}

// Régua estável enquanto a view não mediu: dentro do motor, uma função nova a
// cada render dispararia repaginação sem motivo.
const NO_MEASURE = (): number => 0;

export function useReaderPage({
  bookId,
  position,
  initialOffset,
  metrics,
  enabled,
  onTurnPastEnd,
  onTurnPastStart,
  onPageChange,
}: UseReaderPageOptions): UseReaderPageResult {
  const [direction, setDirection] = useState<PageTurnDirection | null>(null);
  // Última página reportada, para não regravar o mesmo offset a cada render.
  const lastReportedPointRef = useRef<string | null>(null);

  const {
    pages,
    page,
    pageIndex,
    isLoading,
    error,
    isAtChapterStart,
    isAtChapterEnd,
    goToNextPage: goToNextPageInWindow,
    goToPreviousPage: goToPreviousPageInWindow,
    retry,
  } = useReaderWindow({
    bookId,
    position,
    initialOffset,
    pageHeight: metrics?.pageHeight ?? 0,
    measure: metrics?.measure ?? NO_MEASURE,
    enabled,
  });

  // Capítulo novo abre na direção neutra: a virada de ontem não é a de hoje.
  useEffect(() => {
    setDirection(null);
  }, [position]);

  const pageStartOffset = page?.startOffset ?? null;

  useEffect(() => {
    if (pageStartOffset === null) return;

    const pointKey = `${position}:${pageStartOffset}`;
    const isSamePoint = lastReportedPointRef.current === pointKey;
    if (isSamePoint) return;

    lastReportedPointRef.current = pointKey;
    onPageChange(position, pageStartOffset);
  }, [onPageChange, pageStartOffset, position]);

  const goToNextPage = useCallback(() => {
    // Fim do capítulo é da tela de leitura: aqui só avisamos quem sabe virar.
    if (isAtChapterEnd) {
      onTurnPastEnd();
      return;
    }

    setDirection("next");
    goToNextPageInWindow();
  }, [goToNextPageInWindow, isAtChapterEnd, onTurnPastEnd]);

  const goToPreviousPage = useCallback(() => {
    // Início do capítulo é da tela de leitura, como o fim.
    if (isAtChapterStart) {
      onTurnPastStart();
      return;
    }

    setDirection("previous");
    goToPreviousPageInWindow();
  }, [goToPreviousPageInWindow, isAtChapterStart, onTurnPastStart]);

  return {
    page,
    pageIndex,
    totalPages: pages.length,
    direction,
    isLoading,
    error,
    isAtChapterStart,
    isAtChapterEnd,
    goToNextPage,
    goToPreviousPage,
    retry,
  };
}
