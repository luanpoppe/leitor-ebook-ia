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
  restart(): void;
}

// Régua estável enquanto a view não mediu: dentro do motor, uma função nova a
// cada render dispararia repaginação sem motivo.
const NO_MEASURE = (): number => 0;

// A animação de entrada dura 220 ms; a folga evita que a direção sobreviva a
// uma repaginação que não é virada de página.
const DIRECTION_ANIMATION_MS = 260;

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
  const directionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const {
    pages,
    page,
    pageIndex,
    windowPosition,
    isLoading,
    error,
    isAtChapterStart,
    isAtChapterEnd,
    goToNextPage: goToNextPageInWindow,
    goToPreviousPage: goToPreviousPageInWindow,
    retry,
    restart,
  } = useReaderWindow({
    bookId,
    position,
    initialOffset,
    pageHeight: metrics?.pageHeight ?? 0,
    measure: metrics?.measure ?? NO_MEASURE,
    enabled,
  });

  const clearDirectionTimeout = useCallback(() => {
    if (directionTimeoutRef.current === null) return;

    clearTimeout(directionTimeoutRef.current);
    directionTimeoutRef.current = null;
  }, []);

  const applyDirection = useCallback(
    (nextDirection: PageTurnDirection) => {
      clearDirectionTimeout();
      setDirection(nextDirection);
      // A direção é do evento, não da página: sem expirá-la, uma repaginação
      // posterior (fonte, resize) animaria de novo uma página que já está na tela.
      directionTimeoutRef.current = setTimeout(() => {
        directionTimeoutRef.current = null;
        setDirection(null);
      }, DIRECTION_ANIMATION_MS);
    },
    [clearDirectionTimeout]
  );

  useEffect(() => clearDirectionTimeout, [clearDirectionTimeout]);

  // Capítulo novo abre na direção neutra: a virada de ontem não é a de hoje.
  useEffect(() => {
    setDirection(null);
  }, [position]);

  const pageStartOffset = page?.startOffset ?? null;

  useEffect(() => {
    if (pageStartOffset === null) return;

    // Enquanto a sessão for do capítulo anterior, a página é dele: reportar
    // aqui gravaria o offset antigo no capítulo novo.
    const isCurrentChapter =
      windowPosition !== null && windowPosition === position;
    if (!isCurrentChapter) return;

    const pointKey = `${windowPosition}:${pageStartOffset}`;
    const isSamePoint = lastReportedPointRef.current === pointKey;
    if (isSamePoint) return;

    lastReportedPointRef.current = pointKey;
    onPageChange(position, pageStartOffset);
  }, [onPageChange, pageStartOffset, position, windowPosition]);

  const goToNextPage = useCallback(() => {
    // Fim do capítulo é da tela de leitura: aqui só avisamos quem sabe virar.
    if (isAtChapterEnd) {
      onTurnPastEnd();
      return;
    }

    applyDirection("next");
    goToNextPageInWindow();
  }, [applyDirection, goToNextPageInWindow, isAtChapterEnd, onTurnPastEnd]);

  const goToPreviousPage = useCallback(() => {
    // Início do capítulo é da tela de leitura, como o fim.
    if (isAtChapterStart) {
      onTurnPastStart();
      return;
    }

    applyDirection("previous");
    goToPreviousPageInWindow();
  }, [
    applyDirection,
    goToPreviousPageInWindow,
    isAtChapterStart,
    onTurnPastStart,
  ]);

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
    restart,
  };
}
