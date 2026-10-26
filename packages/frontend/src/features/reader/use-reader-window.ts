"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextPage } from "./window/page-paginator";
import { WindowFetcher } from "./window/window-fetcher";
import {
  WindowPager,
  type PageLanding,
  type PageMetrics,
} from "./window/window-pager";
import { WindowTrail } from "./window/window-trail";
import {
  WINDOW_BACKTRACK,
  isSamePoint,
  type TextWindow,
  type WindowPoint,
} from "./window/window-types";

// Menos de 2 páginas à frente é a aproximação de "menos de 1,5 tela" para
// disparar a pré-busca do trecho seguinte.
const PREFETCH_PAGE_THRESHOLD = 2;
const LOAD_ERROR_MESSAGE = "Falha ao carregar o trecho do capítulo.";
// Abaixo disso a última página da janela está visivelmente vazia: vale buscar
// o trecho seguinte para preencher, em vez de cortar a frase no meio da tela.
const LAST_PAGE_FILL_RATIO = 0.75;

interface ReaderSession {
  window: TextWindow;
  pages: TextPage[];
}

/** Capítulo efetivamente carregado, para religar `enabled` sem recomeçar. */
interface LoadedChapter {
  position: number;
  initialOffset: number;
}

export interface UseReaderWindowOptions {
  bookId: string;
  /** Capítulo atual. */
  position: number;
  /** Offset de retomada ao abrir o capítulo. Default 0. */
  initialOffset?: number;
  /** Altura útil da página em px; 0 ou menos = medição ainda não pronta. */
  pageHeight: number;
  /**
   * Altura em px de um pedaço de texto na tipografia atual. O consumidor deve
   * memoizar: uma função nova a cada render dispara repaginação sem motivo.
   */
  measure: (text: string) => number;
  /** Default true. Falso = não busca nada. */
  enabled?: boolean;
}

export interface UseReaderWindowResult {
  pages: TextPage[];
  pageIndex: number;
  page: TextPage | null;
  /** Capítulo dono da sessão exibida; null enquanto a carga não chega. */
  windowPosition: number | null;
  isLoading: boolean;
  error: Error | null;
  isAtChapterStart: boolean;
  isAtChapterEnd: boolean;
  goToPage(index: number): void;
  goToNextPage(): void;
  goToPreviousPage(): void;
  retry(): void;
  restart(): void;
}

export function useReaderWindow({
  bookId,
  position,
  initialOffset = 0,
  pageHeight,
  measure,
  enabled = true,
}: UseReaderWindowOptions): UseReaderWindowResult {
  const [session, setSession] = useState<ReaderSession | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetcher = useMemo(() => new WindowFetcher(bookId), [bookId]);

  const sessionRef = useRef<ReaderSession | null>(null);
  const pageIndexRef = useRef(0);
  const trailRef = useRef<WindowTrail>(
    new WindowTrail({ position, offset: initialOffset })
  );
  // Métricas em ref para a carga não refazer a busca quando a fonte muda.
  const paginationRef = useRef<PageMetrics>({ pageHeight, measure });
  const requestIdRef = useRef(0);
  const failedLoadRef = useRef<{
    point: WindowPoint;
    landing: PageLanding;
  } | null>(null);
  // Só entra no rastro depois que a carga confirma o trecho novo.
  const pendingAdvanceRef = useRef<WindowPoint | null>(null);
  const loadedChapterRef = useRef<LoadedChapter | null>(null);

  useEffect(() => {
    paginationRef.current = { pageHeight, measure };
  }, [pageHeight, measure]);

  const showPage = useCallback(
    (nextSession: ReaderSession, index: number, shouldPrefetch: boolean) => {
      sessionRef.current = nextSession;
      pageIndexRef.current = index;
      setSession(nextSession);
      setPageIndex(index);
      // Navegar para longe da fronteira que falhou não pode manter o aviso nem
      // o destino antigo do retry.
      failedLoadRef.current = null;
      setError(null);

      if (!shouldPrefetch) return;

      const { position: windowPosition, nextOffset } = nextSession.window;
      if (nextOffset === null) return;

      const pagesAhead = nextSession.pages.length - 1 - index;
      const isNearWindowEnd = pagesAhead < PREFETCH_PAGE_THRESHOLD;
      if (!isNearWindowEnd) return;

      fetcher.prefetch({ position: windowPosition, offset: nextOffset });
    },
    [fetcher]
  );

  /**
   * A janela de 20 mil caracteres pode terminar no meio de uma página, deixando
   * um vão grande embaixo (e às vezes cortando uma palavra). Quando a última
   * página está pouco preenchida, busca o trecho seguinte, repagina o conjunto
   * e corta a sessão no fim da página que atravessa a fronteira. Assim a última
   * página fica cheia e o próximo trecho começa exatamente onde ela terminou.
   */
  const fillLastPage = useCallback(
    async (
      window: TextWindow,
      pages: TextPage[],
      metrics: PageMetrics,
    ): Promise<{ window: TextWindow; pages: TextPage[] }> => {
      const lastPage = pages[pages.length - 1];
      const boundaryOffset = window.nextOffset;
      if (lastPage === undefined) return { window, pages };
      if (boundaryOffset === null) return { window, pages };
      if (metrics.pageHeight <= 0) return { window, pages };

      const lastPageHeight = metrics.measure(lastPage.text);
      const isUnderfilled =
        lastPageHeight < metrics.pageHeight * LAST_PAGE_FILL_RATIO;
      if (!isUnderfilled) return { window, pages };

      const lookahead = await fetcher.get({
        position: window.position,
        offset: boundaryOffset,
      });
      if (lookahead.text.length === 0) return { window, pages };

      const mergedWindow: TextWindow = {
        ...window,
        text: window.text + lookahead.text,
        nextOffset: lookahead.nextOffset,
        totalLength: lookahead.totalLength,
      };
      const mergedPages = WindowPager.paginate(mergedWindow, metrics);
      // Página que atravessa a fronteira original: é ela que fica inteira, com
      // o texto do trecho seguinte. O resto do lookahead é descartado.
      const boundaryPageIndex = mergedPages.findIndex(
        (page) => page.endOffset > boundaryOffset,
      );
      if (boundaryPageIndex < 0) return { window, pages };

      const boundaryPage = mergedPages[boundaryPageIndex];
      const trimmedPages = mergedPages.slice(0, boundaryPageIndex + 1);
      const trimmedWindow: TextWindow = {
        ...mergedWindow,
        nextOffset: boundaryPage.endOffset,
      };

      return { window: trimmedWindow, pages: trimmedPages };
    },
    [fetcher],
  );

  const loadWindow = useCallback(
    async (point: WindowPoint, landing: PageLanding) => {
      const requestId = (requestIdRef.current += 1);
      setIsLoading(true);
      setError(null);

      try {
        let window = await fetcher.get(point);
        const isEmptyAtOffset = window.text.length === 0 && point.offset > 0;
        if (isEmptyAtOffset) {
          // Progresso antigo além do texto atual do capítulo: recomeça do zero,
          // uma vez só, para a leitura não abrir numa página vazia.
          const startPoint = { position: point.position, offset: 0 };
          window = await fetcher.get(startPoint);
        }
        if (requestId !== requestIdRef.current) return;

        const returnedPoint = {
          position: window.position,
          offset: window.offset,
        };
        const pendingAdvance = pendingAdvanceRef.current;
        const isPendingLoaded =
          pendingAdvance !== null &&
          isSamePoint(pendingAdvance, returnedPoint);
        if (isPendingLoaded) {
          trailRef.current.advance(returnedPoint);
        }
        pendingAdvanceRef.current = null;

        let pages = WindowPager.paginate(window, paginationRef.current);
        const filled = await fillLastPage(
          window,
          pages,
          paginationRef.current,
        );
        window = filled.window;
        pages = filled.pages;
        const landingIndex = WindowPager.resolveLandingIndex(pages, landing);
        failedLoadRef.current = null;
        showPage({ window, pages }, landingIndex, true);
      } catch (cause) {
        // Resposta de uma carga anterior não pode derrubar a leitura atual.
        if (requestId !== requestIdRef.current) return;

        // Falha não avança o rastro: ele continua apontando para o trecho atual.
        pendingAdvanceRef.current = null;
        // Guarda o destino para o retry repetir a mesma virada.
        failedLoadRef.current = { point, landing };
        const loadError =
          cause instanceof Error ? cause : new Error(LOAD_ERROR_MESSAGE);
        setError(loadError);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [fetcher, fillLastPage, showPage]
  );

  const loadChapter = useCallback(
    (openOffset: number) => {
      // Busca um pouco antes do offset salvo para haver texto anterior para
      // paginar acima, mantendo o offset de abertura dentro da janela.
      const fetchOffset = Math.max(0, openOffset - WINDOW_BACKTRACK);
      const startPoint = { position, offset: fetchOffset };
      loadedChapterRef.current = { position, initialOffset: openOffset };
      pendingAdvanceRef.current = null;
      trailRef.current.reset(startPoint);
      // Trocar de capítulo não pode manter o texto do capítulo anterior na tela.
      sessionRef.current = null;
      pageIndexRef.current = 0;
      setSession(null);
      setPageIndex(0);
      void loadWindow(startPoint, { kind: "offset", offset: openOffset });
    },
    [loadWindow, position]
  );

  const loadChapterStart = useCallback(() => {
    loadChapter(initialOffset);
  }, [initialOffset, loadChapter]);

  const restart = useCallback(() => {
    // Recomeçar o capítulo atual é abrir no offset 0, sem depender do progresso
    // salvo (que continuaria apontando para a página antiga).
    loadChapter(0);
  }, [loadChapter]);

  useEffect(() => {
    if (!enabled) return;

    const loadedChapter = loadedChapterRef.current;
    const isChapterLoaded =
      loadedChapter !== null &&
      loadedChapter.position === position &&
      loadedChapter.initialOffset === initialOffset;
    // Religar `enabled` na mesma sessão continua na página atual.
    if (isChapterLoaded) return;

    loadChapterStart();
  }, [enabled, initialOffset, loadChapterStart, position]);

  /**
   * Repagina a sessão atual preservando a página; passa pelo mesmo
   * preenchimento da última página para o resize não recriar o vão no fim.
   */
  const repaginateWithFill = useCallback(
    async (sessionToRepaginate: ReaderSession, settings: PageMetrics) => {
      const pages = WindowPager.paginate(sessionToRepaginate.window, settings);
      if (pages.length === 0) return;

      const filled = await fillLastPage(
        sessionToRepaginate.window,
        pages,
        settings,
      );
      // Uma carga nova pode ter substituído a sessão enquanto buscava o trecho.
      if (sessionRef.current !== sessionToRepaginate) return;

      const currentPage = sessionToRepaginate.pages[pageIndexRef.current];
      const anchorOffset =
        currentPage?.startOffset ?? sessionToRepaginate.window.offset;
      const nextIndex = WindowPager.resolveAnchorIndex(
        filled.pages,
        anchorOffset,
      );
      showPage(
        { window: filled.window, pages: filled.pages },
        nextIndex,
        false,
      );
    },
    [fillLastPage, showPage],
  );

  useEffect(() => {
    const currentSession = sessionRef.current;
    if (pageHeight <= 0 || currentSession === null) return;

    // Uma repaginação por frame: eventos de resize em rajada não empilham
    // medições do texto inteiro.
    const frameId = requestAnimationFrame(() => {
      const sessionToRepaginate = sessionRef.current;
      if (sessionToRepaginate === null) return;

      void repaginateWithFill(sessionToRepaginate, { pageHeight, measure });
    });

    return () => cancelAnimationFrame(frameId);
  }, [measure, pageHeight, repaginateWithFill]);

  const goToPage = useCallback(
    (index: number) => {
      const currentSession = sessionRef.current;
      if (currentSession === null) return;

      const isOutOfRange = index < 0 || index > currentSession.pages.length - 1;
      if (isOutOfRange) return;

      showPage(currentSession, index, true);
    },
    [showPage]
  );

  const goToNextPage = useCallback(() => {
    const currentSession = sessionRef.current;
    if (currentSession === null) return;

    const nextIndex = pageIndexRef.current + 1;
    if (nextIndex < currentSession.pages.length) {
      showPage(currentSession, nextIndex, true);
      return;
    }

    const chapterWindow = currentSession.window;
    const nextOffset = chapterWindow.nextOffset;
    // Fim do capítulo: quem vira para o próximo capítulo é a tela de leitura.
    if (nextOffset === null) return;

    const nextPoint = { position: chapterWindow.position, offset: nextOffset };
    // O rastro só avança quando a carga confirmar este ponto.
    pendingAdvanceRef.current = nextPoint;

    void loadWindow(nextPoint, { kind: "first" });
  }, [loadWindow, showPage]);

  const goToPreviousPage = useCallback(() => {
    const currentSession = sessionRef.current;
    if (currentSession === null) return;

    const previousIndex = pageIndexRef.current - 1;
    if (previousIndex >= 0) {
      showPage(currentSession, previousIndex, true);
      return;
    }

    const chapterWindow = currentSession.window;
    const backStep = trailRef.current.back(chapterWindow);
    // Início do capítulo: quem volta para o capítulo anterior é a tela.
    if (backStep === null) return;

    void loadWindow(backStep.point, backStep.landing);
  }, [loadWindow, showPage]);

  const retry = useCallback(() => {
    const failedLoad = failedLoadRef.current;
    if (failedLoad !== null) {
      void loadWindow(failedLoad.point, failedLoad.landing);
      return;
    }

    // Sem falha registrada, refaz a abertura do capítulo.
    loadChapterStart();
  }, [loadChapterStart, loadWindow]);

  const pages = session?.pages ?? [];
  return {
    pages,
    pageIndex,
    page: pages[pageIndex] ?? null,
    windowPosition: session?.window.position ?? null,
    isLoading,
    error,
    isAtChapterStart: session?.window.offset === 0 && pageIndex === 0,
    isAtChapterEnd:
      session?.window.nextOffset === null && pageIndex === pages.length - 1,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    retry,
    restart,
  };
}
