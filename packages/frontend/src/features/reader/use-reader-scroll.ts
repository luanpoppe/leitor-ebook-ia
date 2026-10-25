"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WindowFetcher } from "./window/window-fetcher";
import {
  MAX_SCROLL_SEGMENTS,
  ScrollSegments,
  type ScrollSegment,
} from "./window/scroll-segments";
import { WINDOW_SIZE, type WindowPoint } from "./window/window-types";

export type { ScrollParagraph, ScrollSegment } from "./window/scroll-segments";

export interface UseReaderScrollOptions {
  bookId: string;
  /** Capítulo onde a leitura começou (muda quando a tela troca pelo sumário). */
  position: number;
  initialOffset: number;
  /** Posições de capítulo em ordem crescente (vem do sumário da tela). */
  chapterPositions: number[];
  enabled?: boolean;
  /** Topo visível pertence a outro capítulo. */
  onChapterChange(position: number): void;
  /** Offset do primeiro parágrafo visível, para gravar progresso. */
  onPositionChange(position: number, offset: number): void;
}

export interface UseReaderScrollResult {
  segments: ScrollSegment[];
  isLoading: boolean;
  error: Error | null;
  hasReachedEnd: boolean;
  /** Anexa o próximo trecho; no fim do capítulo, o primeiro do capítulo seguinte. */
  loadMore(): void;
  /** Prepende o trecho anterior; no começo do capítulo, o fim do capítulo anterior. */
  loadPrevious(): void;
  /** Refaz a última carga que falhou (ou o primeiro trecho). */
  retry(): void;
  /** A view informa qual trecho/parágrafo está no topo visível. */
  reportVisible(position: number, offset: number): void;
}

type LoadDirection = "reset" | "append" | "prepend";

interface FailedLoad {
  direction: LoadDirection;
  loader: () => Promise<ScrollSegment>;
}

const LOAD_ERROR_MESSAGE = "Falha ao carregar o trecho do capítulo.";

export function useReaderScroll({
  bookId,
  position,
  initialOffset,
  chapterPositions,
  enabled = true,
  onChapterChange,
  onPositionChange,
}: UseReaderScrollOptions): UseReaderScrollResult {
  const [segments, setSegments] = useState<ScrollSegment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);

  const fetcher = useMemo(() => new WindowFetcher(bookId), [bookId]);

  const segmentsRef = useRef<ScrollSegment[]>([]);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const failedLoadRef = useRef<FailedLoad | null>(null);
  const loadedChapterRef = useRef<{
    position: number;
    initialOffset: number;
  } | null>(null);
  const lastReportedRef = useRef<string | null>(null);
  const visibleChapterRef = useRef<number | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const commitSegments = useCallback((nextSegments: ScrollSegment[]) => {
    segmentsRef.current = nextSegments;
    setSegments(nextSegments);
  }, []);

  const applyLoadedSegment = useCallback(
    (direction: LoadDirection, segment: ScrollSegment) => {
      const current = segmentsRef.current;
      if (direction === "reset") return commitSegments([segment]);

      if (direction === "append") {
        const last = current[current.length - 1];
        const isLastSameChapter =
          last !== undefined && segment.position === last.position;
        const isAlreadyCovered = isLastSameChapter && segment.offset <= last.offset;
        if (isAlreadyCovered) return;

        // Anexar descarta o trecho mais antigo.
        return commitSegments(
          [...current, segment].slice(-MAX_SCROLL_SEGMENTS)
        );
      }

      const first = current[0];
      if (first === undefined) return commitSegments([segment]);

      // Capítulos diferentes têm offsets próprios: só o mesmo capítulo colide.
      const isSameChapter = segment.position === first.position;
      const nextSegment = isSameChapter
        ? ScrollSegments.trimEnd(segment, first.offset)
        : segment;
      if (nextSegment.paragraphs.length === 0) return;

      // Prepender descarta o trecho mais novo.
      return commitSegments(
        [nextSegment, ...current].slice(0, MAX_SCROLL_SEGMENTS)
      );
    },
    [commitSegments]
  );

  const runLoad = useCallback(
    async (direction: LoadDirection, loader: () => Promise<ScrollSegment>) => {
      if (!enabledRef.current) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const segment = await loader();
        const isStale = requestId !== requestIdRef.current;
        if (isStale) return;

        failedLoadRef.current = null;
        applyLoadedSegment(direction, segment);
      } catch (cause) {
        // Resposta de uma carga antiga não pode derrubar a leitura atual.
        const isStale = requestId !== requestIdRef.current;
        if (isStale) return;

        failedLoadRef.current = { direction, loader };
        const loadError =
          cause instanceof Error ? cause : new Error(LOAD_ERROR_MESSAGE);
        setError(loadError);
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [applyLoadedSegment]
  );

  const loadSegment = useCallback(
    async (point: WindowPoint) => {
      const textWindow = await fetcher.get(point);
      return ScrollSegments.fromWindow(textWindow);
    },
    [fetcher]
  );

  const loadPreviousChapterTail = useCallback(
    async (previousPosition: number) => {
      const headPoint = { position: previousPosition, offset: 0 };
      const headWindow = await fetcher.get(headPoint);

      // A primeira busca só revela o tamanho; o que aparece acima é a cauda.
      const tailOffset = Math.max(0, headWindow.totalLength - WINDOW_SIZE);
      if (tailOffset === 0) return ScrollSegments.fromWindow(headWindow);

      const tailPoint = { position: previousPosition, offset: tailOffset };
      const tailWindow = await fetcher.get(tailPoint);
      return ScrollSegments.fromWindow(tailWindow);
    },
    [fetcher]
  );

  const loadChapter = useCallback(
    (chapterPosition: number, openOffset: number) => {
      // Trocar de capítulo invalida a carga em voo: a resposta antiga não pode
      // escrever na lista nova.
      requestIdRef.current += 1;
      inFlightRef.current = false;
      failedLoadRef.current = null;
      loadedChapterRef.current = {
        position: chapterPosition,
        initialOffset: openOffset,
      };
      commitSegments([]);
      setHasReachedEnd(false);
      setError(null);

      // Busca uma janela antes do offset para haver texto acima do ponto.
      const fetchOffset = Math.max(0, openOffset - WINDOW_SIZE);
      const startPoint = { position: chapterPosition, offset: fetchOffset };
      void runLoad("reset", () => loadSegment(startPoint));
    },
    [commitSegments, loadSegment, runLoad]
  );

  const loadMore = useCallback(() => {
    const current = segmentsRef.current;
    const last = current[current.length - 1];
    if (last === undefined) return;

    const nextOffset = last.nextOffset;
    if (nextOffset !== null) {
      const nextPoint = { position: last.position, offset: nextOffset };
      void runLoad("append", () => loadSegment(nextPoint));
      return;
    }

    const nextPosition = ScrollSegments.findNextPosition(
      chapterPositions,
      last.position
    );
    if (nextPosition === null) {
      setHasReachedEnd(true);
      return;
    }

    const chapterStartPoint = { position: nextPosition, offset: 0 };
    void runLoad("append", () => loadSegment(chapterStartPoint));
  }, [chapterPositions, loadSegment, runLoad]);

  const loadPrevious = useCallback(() => {
    const current = segmentsRef.current;
    const first = current[0];
    if (first === undefined) return;

    if (first.offset > 0) {
      const previousOffset = Math.max(0, first.offset - WINDOW_SIZE);
      const previousPoint = {
        position: first.position,
        offset: previousOffset,
      };
      void runLoad("prepend", () => loadSegment(previousPoint));
      return;
    }

    const previousPosition = ScrollSegments.findPreviousPosition(
      chapterPositions,
      first.position
    );
    if (previousPosition === null) return;

    void runLoad("prepend", () => loadPreviousChapterTail(previousPosition));
  }, [chapterPositions, loadPreviousChapterTail, loadSegment, runLoad]);

  const retry = useCallback(() => {
    const failedLoad = failedLoadRef.current;
    if (failedLoad !== null) {
      void runLoad(failedLoad.direction, failedLoad.loader);
      return;
    }

    loadChapter(position, initialOffset);
  }, [initialOffset, loadChapter, position, runLoad]);

  const reportVisible = useCallback(
    (visiblePosition: number, offset: number) => {
      const isLoaded = segmentsRef.current.some(
        (segment) => segment.position === visiblePosition
      );
      if (!isLoaded) return;

      const pointKey = `${visiblePosition}:${offset}`;
      const isSamePoint = lastReportedRef.current === pointKey;
      if (!isSamePoint) {
        lastReportedRef.current = pointKey;
        onPositionChange(visiblePosition, offset);
      }

      const isChapterChanged = visibleChapterRef.current !== visiblePosition;
      if (!isChapterChanged) return;

      visibleChapterRef.current = visiblePosition;
      onChapterChange(visiblePosition);
    },
    [onChapterChange, onPositionChange]
  );

  useEffect(() => {
    if (!enabled) return;

    // O capítulo pedido pelo sumário pode já estar anexado (rolagem até o
    // próximo): aí só a view reposiciona, sem refazer a busca.
    const isChapterInSegments = segmentsRef.current.some(
      (segment) => segment.position === position
    );
    if (isChapterInSegments) return;

    const loadedChapter = loadedChapterRef.current;
    const isChapterLoaded =
      loadedChapter !== null &&
      loadedChapter.position === position &&
      loadedChapter.initialOffset === initialOffset;
    if (isChapterLoaded) return;

    loadChapter(position, initialOffset);
  }, [enabled, initialOffset, loadChapter, position]);

  return {
    segments,
    isLoading,
    error,
    hasReachedEnd,
    loadMore,
    loadPrevious,
    retry,
    reportVisible,
  };
}
