"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { getApiErrorInfo } from "@/features/ebooks/api";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import type {
  BookHighlight,
  HighlightColor,
} from "@/features/highlights/api";
import { HighlightActionPopover } from "@/features/highlights/components/highlight-action-popover";
import { ReaderHighlightsDrawer } from "@/features/highlights/components/reader-highlights-drawer";
import { useBookHighlights } from "@/features/highlights/use-book-highlights";
import { useReader } from "../use-reader";
import { useReaderKeyboard } from "../use-reader-keyboard";
import { useReaderMode } from "../use-reader-mode";
import { useReaderPage, type ReaderPageMetrics } from "../use-reader-page";
import { useReaderPreferences } from "../use-reader-preferences";
import { useReaderScroll } from "../use-reader-scroll";
import { useReadingProgressWriter } from "../use-reading-progress-writer";
import { ReaderErrorMessage } from "./reader-error-message";
import { ReaderFooterNotice } from "./reader-footer-notice";
import { ReaderMessage } from "./reader-message";
import { ReaderPageInteraction } from "./reader-page-interaction";
import { ReaderPageView } from "./reader-page-view";
import {
  ReaderScrollView,
  type ReaderScrollViewHandle,
} from "./reader-scroll-view";
import { ReaderTocDrawer } from "./reader-toc-drawer";
import { ReaderChatDrawer } from "../chat/reader-chat-drawer";
import { ReaderCitationPreview } from "../chat/reader-citation-preview";
import type { ChatCitation, ChatSelection } from "../chat/types";
import { ReaderSearchDrawer } from "../search/reader-search-drawer";
import { ReaderNotesDrawer } from "../notes/reader-notes-drawer";
import { useTextSelection } from "../use-text-selection";
import { ReaderSelectionAction } from "./reader-selection-action";
import { ReaderToolbar } from "./reader-toolbar";
import styles from "./reader-screen.module.css";
import messageStyles from "./reader-message.module.css";

const FIRST_CHAPTER_POSITION = 1;
const CHUNK_ERROR_MESSAGE = "Falha ao carregar o trecho do capítulo.";
// Contexto do chat: a página atual e as duas anteriores, com teto de caracteres
// para o prompt não crescer sem limite em páginas muito grandes.
const READING_CONTEXT_PAGES_BEFORE = 2;
const MAX_READING_CONTEXT_CHARS = 12_000;
const SCROLL_CONTEXT_AHEAD_CHARS = 1_500;
const READING_CONTEXT_FALLBACK_CHARS = 6_000;
// O carregamento cobre a área sem desmontar a view que a mede.
const PAGE_LOADING_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

interface ReaderScreenProps {
  bookId: string;
  initialChapterPosition: number | null;
  /** Offset exato ao abrir por link (ex.: uma marcação da página global). */
  initialOffset: number | null;
  /** Conversa aberta ao entrar pela página de conversas. */
  initialConversationId: string | null;
}

// Ponto de leitura: capítulo + offset do primeiro parágrafo visível.
interface ReaderPoint {
  position: number;
  offset: number;
}

// Início já escolhido de uma marcação que continua em outra página.
interface PendingHighlightStart {
  chapterPosition: number;
  startOffset: number;
  text: string;
}

export function ReaderScreen({
  bookId,
  initialChapterPosition,
  initialOffset,
  initialConversationId,
}: ReaderScreenProps): JSX.Element {
  const {
    chapters,
    chapter,
    currentPosition,
    errorKind,
    resumeOffset,
    savedProgress,
    hasPrevious,
    hasNext,
    goToChapter,
    goNext,
    goPrevious,
    retry,
  } = useReader(bookId, initialChapterPosition, initialOffset);
  const {
    fontSize,
    theme,
    alignment,
    canIncrease,
    canDecrease,
    increaseFont,
    decreaseFont,
    toggleTheme,
    toggleAlignment,
  } = useReaderPreferences();
  const { mode, toggleMode } = useReaderMode();
  const { scheduleSave } = useReadingProgressWriter(bookId, savedProgress);
  const { ebook } = useEbookDetail(bookId);
  const {
    highlights,
    isLoading: areHighlightsLoading,
    error: highlightsError,
    reload: reloadHighlights,
    create: createHighlight,
    updateColor: updateHighlightColor,
    remove: removeHighlight,
  } = useBookHighlights(bookId);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(
    initialConversationId !== null
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isHighlightsOpen, setIsHighlightsOpen] = useState(false);
  const [notesInitialNoteId, setNotesInitialNoteId] = useState<string | null>(
    null
  );
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [metrics, setMetrics] = useState<ReaderPageMetrics | null>(null);
  // Capítulo que abre na última página: voltar do começo do capítulo seguinte.
  const [landAtEndPosition, setLandAtEndPosition] = useState<number | null>(
    null
  );
  // Topo da leitura, comum aos dois modos: é o ponto que a troca de modo leva
  // de um para o outro e o que a barra mostra no modo rolagem.
  const [visiblePoint, setVisiblePoint] = useState<ReaderPoint>({
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    offset: resumeOffset,
  });
  // Offset de abertura do modo página. null = ainda seguindo o progresso salvo,
  // que só chega depois da montagem; navegar ou trocar de modo fixa o valor.
  const [pageOffset, setPageOffset] = useState<number | null>(null);
  // Espelho para a rolagem: fixado ao alternar de modo ou voltar de capítulo,
  // para o motor abrir na janela certa em vez do começo do capítulo.
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [scrollAnchor, setScrollAnchor] = useState<ReaderPoint | null>(null);
  const [citationPreview, setCitationPreview] = useState<ChatCitation | null>(
    null
  );
  // Onde a leitura estava quando a citação foi aberta, para o "voltar".
  const [returnPoint, setReturnPoint] = useState<ReaderPoint | null>(null);
  // Trecho selecionado que o chat vai usar como foco da pergunta.
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);
  // Marcação clicada no texto: o popover permite removê-la.
  const [highlightAction, setHighlightAction] = useState<{
    highlight: BookHighlight;
    anchor: DOMRect;
  } | null>(null);
  const [pendingHighlightStart, setPendingHighlightStart] =
    useState<PendingHighlightStart | null>(null);

  const scrollRef = useRef<ReaderScrollViewHandle>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const previewOriginRef = useRef<ReaderPoint | null>(null);
  const isScrollMode = mode === "scroll";

  // Só observa seleção com a leitura limpa (sem sumário, chat, notas ou prévia).
  const textSelection = useTextSelection(
    mainRef,
    !isChatOpen &&
      citationPreview === null &&
      !isTocOpen &&
      !isSearchOpen &&
      !isNotesOpen &&
      !isHighlightsOpen
  );

  // A view mede a área e publica a régua; uma identidade nova a cada render
  // dispararia repaginação em loop.
  const handleMetricsChange = useCallback((nextMetrics: ReaderPageMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const handlePageChange = useCallback(
    (position: number, offset: number) => {
      setVisiblePoint({ position, offset });
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  const isLandingAtChapterEnd =
    chapter !== null && landAtEndPosition === chapter.position;
  const openingPageOffset = pageOffset ?? resumeOffset;
  const openingPageStartOffset = isLandingAtChapterEnd
    ? chapter.totalLength
    : openingPageOffset;

  const handleTurnPastEnd = useCallback(() => {
    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    setPageOffset(0);
    setLandAtEndPosition(null);
    goNext();
    setHasReachedEnd(false);
  }, [goNext, hasNext]);

  const handleTurnPastStart = useCallback(() => {
    const previousPosition = chapter?.previousPosition ?? null;
    if (!hasPrevious || previousPosition === null) return;

    setPageOffset(0);
    setLandAtEndPosition(previousPosition);
    goPrevious();
    setHasReachedEnd(false);
  }, [chapter, goPrevious, hasPrevious]);

  const {
    pages,
    page,
    pageIndex,
    direction,
    error: pageError,
    goToNextPage,
    goToPreviousPage,
    retry: retryPage,
    restart: restartChapter,
  } = useReaderPage({
    bookId,
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    initialOffset: openingPageStartOffset,
    metrics,
    enabled:
      !isScrollMode &&
      chapter !== null &&
      errorKind === null &&
      !hasReachedEnd,
    onTurnPastEnd: handleTurnPastEnd,
    onTurnPastStart: handleTurnPastStart,
    onPageChange: handlePageChange,
  });

  // O popover é ancorado em pixels: qualquer virada de página o invalida.
  useEffect(() => {
    setHighlightAction(null);
  }, [currentPosition, mode, pageIndex]);

  // Lista estável: uma array nova a cada render recriaria as cargas da rolagem.
  const chapterPositions = useMemo(
    () => chapters.map((chapterSummary) => chapterSummary.position),
    [chapters]
  );

  const highlightsByChapter = useMemo(
    () => groupHighlightsByChapter(highlights),
    [highlights]
  );

  const handleScrollPositionChange = useCallback(
    (position: number, offset: number) => {
      setHighlightAction(null);
      setVisiblePoint({ position, offset });
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  // O topo visível cruzou a fronteira: a URL e o capítulo da tela acompanham,
  // para a barra, o sumário e os botões de capítulo apontarem para ele.
  const handleScrollChapterChange = useCallback(
    (position: number) => {
      if (position === currentPosition) return;

      setLandAtEndPosition(null);
      goToChapter(position);
    },
    [currentPosition, goToChapter]
  );

  const {
    segments,
    isLoading: isScrollLoading,
    error: scrollError,
    errorDirection: scrollErrorDirection,
    hasReachedEnd: hasScrollReachedEnd,
    loadMore,
    loadPrevious,
    retry: retryScroll,
    reportVisible,
    jumpToPoint,
  } = useReaderScroll({
    bookId,
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    initialOffset: scrollOffset ?? resumeOffset,
    chapterPositions,
    // Sem capítulo resolvido ainda não se sabe onde abrir: buscar o primeiro
    // capítulo aqui faria a troca de modo piscar o texto errado. A rolagem
    // atravessa capítulos sem desligar.
    enabled: isScrollMode && currentPosition !== null,
    onChapterChange: handleScrollChapterChange,
    onPositionChange: handleScrollPositionChange,
  });

  const handleScrollVisible = useCallback(
    (position: number, offset: number) => {
      reportVisible(position, offset);
    },
    [reportVisible]
  );

  const firstChapterPosition =
    chapters[0]?.position ?? FIRST_CHAPTER_POSITION;

  // Pular capítulo pela barra é navegação explícita: não herda o "abrir no fim"
  // que só existe para a virada de página voltando do primeiro capítulo.
  const handleNextChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);

    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    // Na rolagem o capítulo seguinte pode já estar anexado: quem leva a view
    // até ele é a âncora.
    const nextPosition = chapter?.nextPosition ?? null;
    const isScrollAnchorNeeded = isScrollMode && nextPosition !== null;
    if (isScrollAnchorNeeded) {
      setScrollAnchor({ position: nextPosition, offset: 0 });
    }

    goNext();
    setHasReachedEnd(false);
  }, [chapter, goNext, hasNext, isScrollMode]);

  const handlePreviousChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    const previousPosition = chapter?.previousPosition ?? null;
    const isScrollAnchorNeeded = isScrollMode && previousPosition !== null;
    if (isScrollAnchorNeeded) {
      setScrollAnchor({ position: previousPosition, offset: 0 });
    }

    goPrevious();
  }, [chapter, goPrevious, isScrollMode]);

  const handleToggleToc = useCallback(() => {
    setIsChatOpen(false);
    setIsSearchOpen(false);
    setIsNotesOpen(false);
    setIsHighlightsOpen(false);
    setChatSelection(null);
    setIsTocOpen((isOpen) => !isOpen);
  }, []);

  const handleCloseToc = useCallback(() => {
    setIsTocOpen(false);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsTocOpen(false);
    setIsChatOpen(false);
    setIsNotesOpen(false);
    setIsHighlightsOpen(false);
    setChatSelection(null);
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const handleToggleChat = useCallback(() => {
    setIsTocOpen(false);
    setIsSearchOpen(false);
    setIsNotesOpen(false);
    setIsHighlightsOpen(false);
    setChatSelection(null);
    setIsChatOpen((isOpen) => !isOpen);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatSelection(null);
    setIsChatOpen(false);
  }, []);

  const handleOpenNotes = useCallback(() => {
    setIsTocOpen(false);
    setIsSearchOpen(false);
    setIsChatOpen(false);
    setIsHighlightsOpen(false);
    setChatSelection(null);
    setCitationPreview(null);
    setNotesInitialNoteId(null);
    setIsNotesOpen(true);
  }, []);

  const handleOpenNote = useCallback((noteId: string) => {
    setIsTocOpen(false);
    setIsSearchOpen(false);
    setIsChatOpen(false);
    setIsHighlightsOpen(false);
    setChatSelection(null);
    setCitationPreview(null);
    setNotesInitialNoteId(noteId);
    setIsNotesOpen(true);
  }, []);

  const handleCloseNotes = useCallback(() => {
    setIsNotesOpen(false);
  }, []);

  const handleOpenHighlights = useCallback(() => {
    setIsTocOpen(false);
    setIsSearchOpen(false);
    setIsChatOpen(false);
    setIsNotesOpen(false);
    setChatSelection(null);
    setCitationPreview(null);
    setIsHighlightsOpen(true);
  }, []);

  const handleCloseHighlights = useCallback(() => {
    setIsHighlightsOpen(false);
  }, []);

  // Pular para um ponto do livro nos dois modos. A citação usa isto e o
  // "voltar" reusa o mesmo caminho.
  const navigateToPoint = useCallback(
    (point: ReaderPoint) => {
      setHasReachedEnd(false);
      setLandAtEndPosition(null);

      if (isScrollMode) {
        setScrollOffset(point.offset);
        setScrollAnchor(point);
        jumpToPoint(point.position, point.offset);
      } else {
        setPageOffset(point.offset);
      }

      const isSameChapter = point.position === currentPosition;
      if (isSameChapter) return;

      goToChapter(point.position);
    },
    [currentPosition, goToChapter, isScrollMode, jumpToPoint]
  );

  const handleSearchSelect = useCallback(
    (position: number, offset: number) => {
      setIsSearchOpen(false);
      navigateToPoint({ position, offset });
    },
    [navigateToPoint]
  );

  const handleHighlightSelect = useCallback(
    (highlight: BookHighlight) => {
      const origin = {
        position: currentPosition ?? FIRST_CHAPTER_POSITION,
        offset: isScrollMode ? visiblePoint.offset : page?.startOffset ?? 0,
      };
      setReturnPoint(origin);
      setIsHighlightsOpen(false);
      navigateToPoint({
        position: highlight.chapterPosition,
        offset: highlight.startOffset,
      });
    },
    [currentPosition, isScrollMode, navigateToPoint, page, visiblePoint.offset]
  );

  // Citação do chat: abre a prévia sem mover a leitura principal.
  const handleCitationSelect = useCallback(
    (citation: ChatCitation) => {
      previewOriginRef.current = {
        position: currentPosition ?? FIRST_CHAPTER_POSITION,
        offset: isScrollMode ? visiblePoint.offset : page?.startOffset ?? 0,
      };
      setCitationPreview(citation);
    },
    [currentPosition, isScrollMode, page, visiblePoint.offset]
  );

  const handleCloseCitationPreview = useCallback(() => {
    setCitationPreview(null);
  }, []);

  // Seleção virou pergunta: abre o chat com o trecho fixado.
  const handleAskSelection = useCallback(() => {
    if (textSelection === null) return;

    setChatSelection({
      text: textSelection.text,
      before: textSelection.before,
    });
    setIsTocOpen(false);
    setIsNotesOpen(false);
    setIsChatOpen(true);
    window.getSelection()?.removeAllRanges();
  }, [textSelection]);

  const handleClearChatSelection = useCallback(() => {
    setChatSelection(null);
  }, []);

  const handleHighlightSelection = useCallback(
    async (color: HighlightColor): Promise<void> => {
      if (textSelection === null) return;

      const { chapterPosition, startOffset, endOffset } = textSelection;
      if (
        chapterPosition === null ||
        startOffset === null ||
        endOffset === null
      ) {
        toast.error("Não foi possível identificar o trecho selecionado.");
        return;
      }

      let highlightStart = startOffset;

      if (pendingHighlightStart !== null) {
        const isOtherChapter =
          pendingHighlightStart.chapterPosition !== chapterPosition;
        if (isOtherChapter) {
          toast.error(
            "A marcação iniciada precisa terminar no mesmo capítulo. Volte ao capítulo e selecione o fim."
          );
          return;
        }

        const isEndBeforeStart = endOffset <= pendingHighlightStart.startOffset;
        if (isEndBeforeStart) {
          toast.error("Selecione um trecho depois do início da marcação.");
          return;
        }

        highlightStart = pendingHighlightStart.startOffset;
      }

      try {
        await createHighlight({
          chapterPosition,
          startOffset: highlightStart,
          endOffset,
          color,
        });
        window.getSelection()?.removeAllRanges();
        setPendingHighlightStart(null);
        toast.success("Marcação criada.");
      } catch (cause) {
        toast.error(getApiErrorInfo(cause).message);
      }
    },
    [createHighlight, pendingHighlightStart, textSelection]
  );

  const handleStartMultiPageHighlight = useCallback(() => {
    if (textSelection === null) return;

    const { chapterPosition, startOffset, text } = textSelection;
    if (chapterPosition === null || startOffset === null) {
      toast.error("Não foi possível identificar o início da marcação.");
      return;
    }

    setPendingHighlightStart({
      chapterPosition,
      startOffset,
      text: text.slice(0, 80),
    });
    window.getSelection()?.removeAllRanges();
    toast.success("Marcação iniciada. Selecione o fim em outra página.");
  }, [textSelection]);

  const handleCancelPendingHighlight = useCallback(() => {
    setPendingHighlightStart(null);
  }, []);

  const handleChangeHighlightColor = useCallback(
    async (highlightId: string, color: HighlightColor): Promise<void> => {
      await updateHighlightColor(highlightId, color);
      toast.success("Cor da marcação atualizada.");
    },
    [updateHighlightColor]
  );

  const handleRemoveHighlight = useCallback(
    async (highlightId: string): Promise<void> => {
      await removeHighlight(highlightId);
      setHighlightAction((current) =>
        current?.highlight.id === highlightId ? null : current
      );
      toast.success("Marcação removida.");
    },
    [removeHighlight]
  );

  const handleHighlightClick = useCallback(
    (highlight: BookHighlight, anchor: DOMRect) => {
      setHighlightAction({ highlight, anchor });
    },
    []
  );

  const handleRemoveHighlightFromPopover = useCallback(
    async (highlight: BookHighlight): Promise<void> => {
      try {
        await handleRemoveHighlight(highlight.id);
      } catch (cause) {
        toast.error(getApiErrorInfo(cause).message);
      }
    },
    [handleRemoveHighlight]
  );

  const handleGoToReadingFromPreview = useCallback(
    (citation: ChatCitation) => {
      const origin = previewOriginRef.current;
      if (origin !== null) setReturnPoint(origin);

      navigateToPoint({
        position: citation.chapterPosition,
        offset: citation.offset,
      });
      setCitationPreview(null);
      setIsChatOpen(false);
      setChatSelection(null);
    },
    [navigateToPoint]
  );

  const handleReturnToPoint = useCallback(() => {
    if (returnPoint === null) return;

    navigateToPoint(returnPoint);
    setReturnPoint(null);
  }, [navigateToPoint, returnPoint]);

  const handleDismissReturnPoint = useCallback(() => {
    setReturnPoint(null);
  }, []);

  const handleSelectChapter = useCallback(
    (position: number) => {
      setPageOffset(0);
      setScrollOffset(0);
      setLandAtEndPosition(null);
      setIsTocOpen(false);
      setHasReachedEnd(false);

      if (isScrollMode) {
        // O capítulo pode já estar anexado: a âncora leva a view ao começo.
        setScrollAnchor({ position, offset: 0 });
      }

      // Escolher o capítulo já aberto rebobina em vez de virar no-op.
      if (position === currentPosition) {
        if (isScrollMode) return;
        restartChapter();
        return;
      }

      goToChapter(position);
    },
    [currentPosition, goToChapter, isScrollMode, restartChapter]
  );

  const handleGoToNoteChapter = useCallback(
    (position: number) => {
      setIsNotesOpen(false);
      handleSelectChapter(position);
    },
    [handleSelectChapter]
  );

  const handleOpenFirstChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    if (isScrollMode) {
      setScrollAnchor({ position: firstChapterPosition, offset: 0 });
    }

    // Livro de um capítulo só: o capítulo já é o primeiro, então recomeça nele.
    if (currentPosition === firstChapterPosition) {
      if (isScrollMode) return;
      restartChapter();
      return;
    }

    goToChapter(firstChapterPosition);
  }, [
    currentPosition,
    firstChapterPosition,
    goToChapter,
    isScrollMode,
    restartChapter,
  ]);

  const handleToggleMode = useCallback(() => {
    const isEnteringPageMode = isScrollMode;
    toggleMode();
    // "Abrir no fim" pertence à virada de página: trocar de modo não herda.
    setLandAtEndPosition(null);

    if (isEnteringPageMode) {
      const isVisibleChapterDifferent =
        visiblePoint.position !== currentPosition;
      if (isVisibleChapterDifferent) {
        goToChapter(visiblePoint.position);
      }

      // O offset do topo vale para o capítulo que vai abrir.
      setPageOffset(visiblePoint.offset);
      return;
    }

    // Entrar na rolagem não herda o fim do livro do modo página: quem sinaliza
    // o fim no fluxo contínuo é a própria view, no pé do texto.
    setHasReachedEnd(false);
    setScrollOffset(visiblePoint.offset);
    setScrollAnchor(visiblePoint);
  }, [currentPosition, goToChapter, isScrollMode, toggleMode, visiblePoint]);

  // Abrir direto em rolagem (preferência salva) não passa pelo botão de modo:
  // sem âncora a view mostraria o começo da janela e regravaria progresso menor.
  useEffect(() => {
    if (mode !== "scroll") return;
    if (scrollAnchor !== null) return;
    if (chapter === null) return;
    if (currentPosition === null) return;

    setScrollAnchor({ position: currentPosition, offset: resumeOffset });
  }, [chapter, currentPosition, mode, resumeOffset, scrollAnchor]);

  const handleScrollPage = useCallback(
    (direction: -1 | 1, fraction?: number) => {
      scrollRef.current?.scrollByPage(direction, fraction);
    },
    []
  );

  const currentChapterHighlights =
    chapter === null ? [] : highlightsByChapter.get(chapter.position) ?? [];
  const readerTitle = ebook?.title ?? "Leitura";
  const backHref =
    initialConversationId === null
      ? `/ebooks/${bookId}`
      : `/conversas/${initialConversationId}`;
  const backLabel =
    initialConversationId === null
      ? undefined
      : "Voltar para a conversa";
  const chaptersCount = chapters.length;
  const toolbarPosition = isScrollMode
    ? visiblePoint.position
    : currentPosition;
  const pageLabel =
    isScrollMode || page === null || chapter === null
      ? null
      : `${Math.round(
          resolveChapterProgress(page.startOffset, chapter.totalLength) * 100
        )}% do capítulo`;

  // Progresso do livro: capítulos anteriores inteiros + a fração lida do atual.
  const bookProgress = useMemo(() => {
    if (chapters.length === 0) return null;

    const totalWords = chapters.reduce(
      (sum, item) => sum + item.wordCount,
      0
    );
    if (totalWords <= 0) return null;

    const position = isScrollMode ? visiblePoint.position : toolbarPosition;
    if (position === null) return null;

    const wordsBefore = chapters
      .filter((item) => item.position < position)
      .reduce((sum, item) => sum + item.wordCount, 0);
    const currentChapter = chapters.find((item) => item.position === position);
    const currentWords = currentChapter?.wordCount ?? 0;
    const offset = isScrollMode ? visiblePoint.offset : page?.startOffset ?? 0;
    const isChapterLoaded =
      chapter !== null &&
      chapter.position === position &&
      chapter.totalLength > 0;
    const chapterFraction = isChapterLoaded
      ? Math.min(Math.max(offset / chapter.totalLength, 0), 1)
      : 0;
    const progress = (wordsBefore + currentWords * chapterFraction) / totalWords;

    return Math.min(Math.max(progress, 0), 1);
  }, [
    chapter,
    chapters,
    isScrollMode,
    page,
    toolbarPosition,
    visiblePoint.offset,
    visiblePoint.position,
  ]);

  // Na rolagem o trecho visível conhece o total do capítulo; o capítulo da tela
  // é só o fallback enquanto a view ainda não reportou.
  const visibleScrollSegment = segments.find(
    (segment) => segment.position === visiblePoint.position
  );
  const scrollTotalLength =
    visibleScrollSegment?.totalLength ?? chapter?.totalLength ?? 0;
  const progressOffset = isScrollMode
    ? visiblePoint.offset
    : page?.startOffset ?? 0;
  const progressTotalLength = isScrollMode
    ? scrollTotalLength
    : chapter?.totalLength ?? 0;
  const chapterProgress = resolveChapterProgress(
    progressOffset,
    progressTotalLength
  );

  const isPageReadingBlocked =
    hasReachedEnd ||
    errorKind !== null ||
    pageError !== null ||
    chapter === null;
  // Falha de trecho na rolagem não trava o texto já carregado; só a ausência de
  // capítulo e o erro global impedem a leitura.
  const isScrollReadingBlocked = errorKind !== null || chapter === null;
  // Faixa enviada ao chat: página atual + duas anteriores (ou a tela atual na
  // rolagem). O backend busca esse texto no capítulo.
  const chatContext = useMemo(() => {
    if (isScrollMode) {
      const end = visiblePoint.offset + SCROLL_CONTEXT_AHEAD_CHARS;
      const start = Math.max(0, end - MAX_READING_CONTEXT_CHARS);

      return { start, end };
    }

    const currentPage = page;
    if (currentPage === null) {
      return {
        start: Math.max(0, openingPageOffset - READING_CONTEXT_FALLBACK_CHARS),
        end: openingPageOffset,
      };
    }

    const firstPageIndex = Math.max(0, pageIndex - READING_CONTEXT_PAGES_BEFORE);
    const firstPage = pages[firstPageIndex] ?? currentPage;
    const start = Math.max(0, firstPage.startOffset);
    const end = currentPage.endOffset;

    return {
      start: Math.max(start, end - MAX_READING_CONTEXT_CHARS),
      end,
    };
  }, [
    isScrollMode,
    openingPageOffset,
    page,
    pageIndex,
    pages,
    visiblePoint.offset,
  ]);

  const isReadingBlocked = isScrollMode
    ? isScrollReadingBlocked
    : isPageReadingBlocked;
  const isReadingLocked =
    isReadingBlocked ||
    isChatOpen ||
    isSearchOpen ||
    isNotesOpen ||
    isHighlightsOpen ||
    citationPreview !== null;
  const isChunkErrorVisible =
    !isScrollMode && pageError !== null && errorKind === null && !hasReachedEnd;
  // Falha tem o aviso do rodapé; página nula sem falha é carga em andamento.
  const isPagePending =
    !isScrollMode && chapter !== null && page === null && pageError === null;

  useReaderKeyboard({
    mode,
    isTocOpen,
    isReadingBlocked: isReadingLocked,
    onCloseToc: handleCloseToc,
    onNext: goToNextPage,
    onPrevious: goToPreviousPage,
    onScrollPage: handleScrollPage,
  });

  const renderBody = () => {
    if (errorKind !== null) {
      return (
        <ReaderErrorMessage
          errorKind={errorKind}
          backHref={backHref}
          onRetry={retry}
          onOpenFirstChapter={handleOpenFirstChapter}
        />
      );
    }

    // A view desenha o próprio carregando, a falha com retry e o fim do livro.
    // Ao atravessar capítulos o metadado fica nulo por um instante: com trechos
    // em memória a view continua montada para a leitura não pular.
    if (isScrollMode) {
      const isScrollEmpty = segments.length === 0;
      if (chapter === null && isScrollEmpty) {
        return (
          <div className={styles.loading} aria-live="polite">
            <p className={styles.loadingText}>Carregando livro…</p>
          </div>
        );
      }

      return (
        <ReaderScrollView
          ref={scrollRef}
          segments={segments}
          isLoading={isScrollLoading}
          error={scrollError}
          errorDirection={scrollErrorDirection}
          hasReachedEnd={hasScrollReachedEnd}
          fontSize={fontSize}
          theme={theme}
          alignment={alignment}
          highlightsByChapter={highlightsByChapter}
          onHighlightClick={handleHighlightClick}
          anchor={scrollAnchor}
          onLoadMore={loadMore}
          onLoadPrevious={loadPrevious}
          onRetry={retryScroll}
          onVisibleChange={handleScrollVisible}
        />
      );
    }

    // Sem capítulo e sem erro, ainda estamos abrindo o livro — inclusive se a
    // query ainda nem começou.
    if (chapter === null) {
      return (
        <div className={styles.loading} aria-live="polite">
          <p className={styles.loadingText}>Carregando livro…</p>
        </div>
      );
    }

    if (hasReachedEnd) {
      return (
        <ReaderMessage
          title="Fim do livro"
          description={`Você terminou ${readerTitle}.`}
          isEndOfBook
        >
          <Link href="/" className={messageStyles.secondaryAction}>
            Voltar à estante
          </Link>
          <button
            type="button"
            onClick={handleOpenFirstChapter}
            className={messageStyles.primaryAction}
          >
            Reler desde o começo
          </button>
        </ReaderMessage>
      );
    }

    return (
      <ReaderPageInteraction
        isBlocked={isReadingBlocked}
        onNext={goToNextPage}
        onPrevious={goToPreviousPage}
        onOpenToc={handleToggleToc}
      >
        <ReaderPageView
          page={page}
          position={chapter.position}
          highlights={currentChapterHighlights}
          onHighlightClick={handleHighlightClick}
          pageKey={`${chapter.position}:${pageIndex}`}
          direction={direction}
          fontSize={fontSize}
          theme={theme}
          alignment={alignment}
          onMetricsChange={handleMetricsChange}
        />

        {isPagePending && (
          <div
            className={styles.loading}
            style={PAGE_LOADING_STYLE}
            aria-live="polite"
          >
            <p className={styles.loadingText}>Carregando página…</p>
          </div>
        )}
      </ReaderPageInteraction>
    );
  };

  return (
    <div className={styles.screen} data-theme={theme}>
      <ReaderToolbar
        bookTitle={readerTitle}
        backHref={backHref}
        backLabel={backLabel}
        currentPosition={toolbarPosition}
        chaptersCount={chaptersCount}
        pageLabel={pageLabel}
        bookProgress={bookProgress}
        chapterProgress={chapterProgress}
        isTocOpen={isTocOpen}
        onToggleToc={handleToggleToc}
        onOpenSearch={handleOpenSearch}
        onOpenNotes={handleOpenNotes}
        isHighlightsOpen={isHighlightsOpen}
        onOpenHighlights={handleOpenHighlights}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={handlePreviousChapter}
        onNext={handleNextChapter}
        fontSize={fontSize}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        onDecreaseFont={decreaseFont}
        onIncreaseFont={increaseFont}
        theme={theme}
        onToggleTheme={toggleTheme}
        alignment={alignment}
        onToggleAlignment={toggleAlignment}
        mode={mode}
        onToggleMode={handleToggleMode}
        isChatOpen={isChatOpen}
        onToggleChat={handleToggleChat}
        hasTextSelection={textSelection !== null && !isChatOpen}
        isMultiPagePending={pendingHighlightStart !== null}
        onAskSelection={handleAskSelection}
        onHighlightSelection={(color) => void handleHighlightSelection(color)}
        onStartMultiPage={handleStartMultiPageHighlight}
      />

      <main ref={mainRef} className={styles.main}>
        {renderBody()}

        {isChunkErrorVisible && (
          <ReaderFooterNotice
            message={CHUNK_ERROR_MESSAGE}
            onRetry={retryPage}
          />
        )}
      </main>

      {highlightAction !== null && (
        <HighlightActionPopover
          highlight={highlightAction.highlight}
          anchor={highlightAction.anchor}
          onRemove={() =>
            void handleRemoveHighlightFromPopover(highlightAction.highlight)
          }
          onClose={() => setHighlightAction(null)}
        />
      )}

      {isTocOpen && (
        <ReaderTocDrawer
          chapters={chapters}
          currentPosition={toolbarPosition}
          onSelect={handleSelectChapter}
          onClose={handleCloseToc}
        />
      )}

      <ReaderChatDrawer
        bookId={bookId}
        isOpen={isChatOpen}
        initialConversationId={initialConversationId}
        position={
            isScrollMode
              ? visiblePoint.position
              : toolbarPosition ?? FIRST_CHAPTER_POSITION
          }
          offset={isScrollMode ? visiblePoint.offset : page?.startOffset ?? 0}
          contextStart={chatContext.start}
          contextEnd={chatContext.end}
          selection={chatSelection}
          onClearSelection={handleClearChatSelection}
          isSuspended={citationPreview !== null}
          onClose={handleCloseChat}
          onOpenNotes={handleOpenNotes}
          onOpenNote={handleOpenNote}
          onCitationSelect={handleCitationSelect}
        />

      {isSearchOpen && (
        <ReaderSearchDrawer
          bookId={bookId}
          onClose={handleCloseSearch}
          onSelect={handleSearchSelect}
        />
      )}

      {isNotesOpen && (
        <ReaderNotesDrawer
          bookId={bookId}
          currentChapterPosition={currentPosition}
          initialNoteId={notesInitialNoteId}
          onClose={handleCloseNotes}
          onGoToChapter={handleGoToNoteChapter}
        />
      )}

      {isHighlightsOpen && (
        <ReaderHighlightsDrawer
          highlights={highlights}
          isLoading={areHighlightsLoading}
          error={highlightsError}
          onClose={handleCloseHighlights}
          onReload={reloadHighlights}
          onSelect={handleHighlightSelect}
          onChangeColor={handleChangeHighlightColor}
          onRemove={handleRemoveHighlight}
        />
      )}

      {citationPreview !== null && (
        <ReaderCitationPreview
          bookId={bookId}
          citation={citationPreview}
          fontSize={fontSize}
          theme={theme}
          alignment={alignment}
          onClose={handleCloseCitationPreview}
          onGoToReading={handleGoToReadingFromPreview}
        />
      )}

      {textSelection !== null && !isChatOpen && (
        <ReaderSelectionAction
          selection={textSelection}
          isMultiPagePending={pendingHighlightStart !== null}
          onAsk={handleAskSelection}
          onHighlight={(color) => void handleHighlightSelection(color)}
          onStartMultiPage={handleStartMultiPageHighlight}
        />
      )}

      {pendingHighlightStart !== null && (
        <div className={styles.pendingBar} role="status">
          <span className={styles.pendingText}>
            Marcação iniciada em “{pendingHighlightStart.text}”. Selecione o fim
            em outra página e escolha a cor.
          </span>
          <button
            type="button"
            className={styles.pendingCancel}
            onClick={handleCancelPendingHighlight}
          >
            Cancelar
          </button>
        </div>
      )}

      {returnPoint !== null && (
        <div
          className={styles.returnBar}
          style={
            pendingHighlightStart === null ? undefined : { bottom: 76 }
          }
          role="status"
        >
          <button
            type="button"
            className={styles.returnButton}
            onClick={handleReturnToPoint}
          >
            ← Voltar para onde eu estava
          </button>
          <button
            type="button"
            className={styles.returnDismiss}
            onClick={handleDismissReturnPoint}
            aria-label="Descartar retorno"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function resolveChapterProgress(offset: number, totalLength: number): number {
  if (totalLength <= 0) return 0;

  const ratio = offset / totalLength;
  const lowerBoundedRatio = Math.max(ratio, 0);
  return Math.min(lowerBoundedRatio, 1);
}

function groupHighlightsByChapter(
  highlights: BookHighlight[]
): ReadonlyMap<number, BookHighlight[]> {
  const byChapter = new Map<number, BookHighlight[]>();

  for (const highlight of highlights) {
    const current = byChapter.get(highlight.chapterPosition);
    if (current === undefined) {
      byChapter.set(highlight.chapterPosition, [highlight]);
      continue;
    }

    current.push(highlight);
  }

  return byChapter;
}
