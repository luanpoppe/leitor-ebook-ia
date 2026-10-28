"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useReader } from "../use-reader";
import { useReaderKeyboard } from "../use-reader-keyboard";
import { useReaderMode } from "../use-reader-mode";
import { useReaderPage, type ReaderPageMetrics } from "../use-reader-page";
import { useReaderPreferences } from "../use-reader-preferences";
import { useReadingProgressWriter } from "../use-reading-progress-writer";
import { ReaderErrorMessage } from "./reader-error-message";
import { ReaderFooterNotice } from "./reader-footer-notice";
import { ReaderMessage } from "./reader-message";
import { ReaderPageInteraction } from "./reader-page-interaction";
import { ReaderPageView } from "./reader-page-view";
import { ReaderScrollPager } from "./reader-scroll-pager";
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
const READING_CONTEXT_FALLBACK_CHARS = 6_000;
// O carregamento cobre a área sem desmontar a view que a mede.
const PAGE_LOADING_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

interface ReaderScreenProps {
  bookId: string;
  initialChapterPosition: number | null;
}

// Ponto de leitura: capítulo + offset do primeiro parágrafo visível.
interface ReaderPoint {
  position: number;
  offset: number;
}

export function ReaderScreen({
  bookId,
  initialChapterPosition,
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
  } = useReader(bookId, initialChapterPosition);
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

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesInitialNoteId, setNotesInitialNoteId] = useState<string | null>(
    null
  );
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [metrics, setMetrics] = useState<ReaderPageMetrics | null>(null);
  // Capítulo que abre na última página: voltar do começo do capítulo seguinte.
  const [landAtEndPosition, setLandAtEndPosition] = useState<number | null>(
    null
  );
  // Offset de abertura da página. null = ainda seguindo o progresso salvo, que
  // só chega depois da montagem; navegar ou trocar de capítulo fixa o valor.
  const [pageOffset, setPageOffset] = useState<number | null>(null);
  const [citationPreview, setCitationPreview] = useState<ChatCitation | null>(
    null
  );
  // Onde a leitura estava quando a citação foi aberta, para o "voltar".
  const [returnPoint, setReturnPoint] = useState<ReaderPoint | null>(null);
  // Trecho selecionado que o chat vai usar como foco da pergunta.
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);

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
      !isNotesOpen
  );

  // A view mede a área e publica a régua; uma identidade nova a cada render
  // dispararia repaginação em loop.
  const handleMetricsChange = useCallback((nextMetrics: ReaderPageMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const handlePageChange = useCallback(
    (position: number, offset: number) => {
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  const isLandingAtChapterEnd =
    chapter !== null && landAtEndPosition === chapter.position;
  const openingPageOffset = pageOffset ?? resumeOffset;
  const initialOffset = isLandingAtChapterEnd
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
    initialOffset,
    metrics,
    enabled: chapter !== null && errorKind === null && !hasReachedEnd,
    onTurnPastEnd: handleTurnPastEnd,
    onTurnPastStart: handleTurnPastStart,
    onPageChange: handlePageChange,
  });

  const firstChapterPosition =
    chapters[0]?.position ?? FIRST_CHAPTER_POSITION;

  // Pular capítulo pela barra é navegação explícita: não herda o "abrir no fim"
  // que só existe para a virada de página voltando do primeiro capítulo.
  const handleNextChapter = useCallback(() => {
    setPageOffset(0);
    setLandAtEndPosition(null);

    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    goNext();
    setHasReachedEnd(false);
  }, [goNext, hasNext]);

  const handlePreviousChapter = useCallback(() => {
    setPageOffset(0);
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    goPrevious();
  }, [goPrevious]);

  const handleToggleToc = useCallback(() => {
    setIsChatOpen(false);
    setIsSearchOpen(false);
    setIsNotesOpen(false);
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
    setChatSelection(null);
    setCitationPreview(null);
    setNotesInitialNoteId(null);
    setIsNotesOpen(true);
  }, []);

  const handleOpenNote = useCallback((noteId: string) => {
    setIsTocOpen(false);
    setIsSearchOpen(false);
    setIsChatOpen(false);
    setChatSelection(null);
    setCitationPreview(null);
    setNotesInitialNoteId(noteId);
    setIsNotesOpen(true);
  }, []);

  const handleCloseNotes = useCallback(() => {
    setIsNotesOpen(false);
  }, []);

  // Pular para um ponto do livro nos dois modos. A citação usa isto e o
  // "voltar" reusa o mesmo caminho.
  const navigateToPoint = useCallback(
    (point: ReaderPoint) => {
      setHasReachedEnd(false);
      setLandAtEndPosition(null);
      setPageOffset(point.offset);

      const isSameChapter = point.position === currentPosition;
      if (isSameChapter) return;

      goToChapter(point.position);
    },
    [currentPosition, goToChapter]
  );

  const handleSearchSelect = useCallback(
    (position: number, offset: number) => {
      setIsSearchOpen(false);
      navigateToPoint({ position, offset });
    },
    [navigateToPoint]
  );

  // Citação do chat: abre a prévia sem mover a leitura principal.
  const handleCitationSelect = useCallback(
    (citation: ChatCitation) => {
      previewOriginRef.current = {
        position: currentPosition ?? FIRST_CHAPTER_POSITION,
        offset: page?.startOffset ?? 0,
      };
      setCitationPreview(citation);
    },
    [currentPosition, page]
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
      setLandAtEndPosition(null);
      setIsTocOpen(false);
      setHasReachedEnd(false);

      // Escolher o capítulo já aberto rebobina em vez de virar no-op.
      if (position === currentPosition) {
        restartChapter();
        return;
      }

      goToChapter(position);
    },
    [currentPosition, goToChapter, restartChapter]
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
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    // Livro de um capítulo só: o capítulo já é o primeiro, então recomeça nele.
    if (currentPosition === firstChapterPosition) {
      restartChapter();
      return;
    }

    goToChapter(firstChapterPosition);
  }, [
    currentPosition,
    firstChapterPosition,
    goToChapter,
    restartChapter,
  ]);

  const handleToggleMode = useCallback(() => {
    toggleMode();
    setLandAtEndPosition(null);
    setHasReachedEnd(false);
  }, [toggleMode]);

  const handleScrollPage = useCallback(
    (direction: -1 | 1) => {
      if (direction === 1) {
        goToNextPage();
        return;
      }

      goToPreviousPage();
    },
    [goToNextPage, goToPreviousPage]
  );

  const readerTitle = ebook?.title ?? "Leitura";
  const backHref = `/ebooks/${bookId}`;
  const chaptersCount = chapters.length;
  const toolbarPosition = currentPosition;
  const pageLabel =
    page === null || chapter === null
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

    const position = toolbarPosition;
    if (position === null) return null;

    const wordsBefore = chapters
      .filter((item) => item.position < position)
      .reduce((sum, item) => sum + item.wordCount, 0);
    const currentChapter = chapters.find((item) => item.position === position);
    const currentWords = currentChapter?.wordCount ?? 0;
    const offset = page?.startOffset ?? 0;
    const isChapterLoaded =
      chapter !== null &&
      chapter.position === position &&
      chapter.totalLength > 0;
    const chapterFraction = isChapterLoaded
      ? Math.min(Math.max(offset / chapter.totalLength, 0), 1)
      : 0;
    const progress = (wordsBefore + currentWords * chapterFraction) / totalWords;

    return Math.min(Math.max(progress, 0), 1);
  }, [chapter, chapters, page, toolbarPosition]);

  const progressOffset = page?.startOffset ?? 0;
  const progressTotalLength = chapter?.totalLength ?? 0;
  const chapterProgress = resolveChapterProgress(
    progressOffset,
    progressTotalLength
  );

  const isPageReadingBlocked =
    hasReachedEnd ||
    errorKind !== null ||
    pageError !== null ||
    chapter === null;
  // Faixa enviada ao chat: página atual + duas anteriores. O backend busca
  // esse texto no capítulo.
  const chatContext = useMemo(() => {
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
  }, [openingPageOffset, page, pageIndex, pages]);

  const isReadingBlocked = isPageReadingBlocked;
  const isReadingLocked =
    isReadingBlocked ||
    isChatOpen ||
    isSearchOpen ||
    isNotesOpen ||
    citationPreview !== null;
  const isChunkErrorVisible =
    pageError !== null && errorKind === null && !hasReachedEnd;
  // Falha tem o aviso do rodapé; página nula sem falha é carga em andamento.
  const isPagePending =
    chapter !== null && page === null && pageError === null;

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

    const pageView = (
      <ReaderPageView
        page={page}
        pageKey={`${chapter.position}:${pageIndex}`}
        direction={direction}
        turnAxis={isScrollMode ? "vertical" : "horizontal"}
        fontSize={fontSize}
        theme={theme}
        alignment={alignment}
        onMetricsChange={handleMetricsChange}
      />
    );
    const pageLoading = isPagePending ? (
      <div
        className={styles.loading}
        style={PAGE_LOADING_STYLE}
        aria-live="polite"
      >
        <p className={styles.loadingText}>Carregando página…</p>
      </div>
    ) : null;

    if (isScrollMode) {
      return (
        <ReaderScrollPager
          isBlocked={isReadingBlocked}
          onNext={goToNextPage}
          onPrevious={goToPreviousPage}
        >
          {pageView}
          {pageLoading}
        </ReaderScrollPager>
      );
    }

    return (
      <ReaderPageInteraction
        isBlocked={isReadingBlocked}
        onNext={goToNextPage}
        onPrevious={goToPreviousPage}
        onOpenToc={handleToggleToc}
      >
        {pageView}
        {pageLoading}
      </ReaderPageInteraction>
    );
  };

  return (
    <div className={styles.screen} data-theme={theme}>
      <ReaderToolbar
        bookTitle={readerTitle}
        backHref={backHref}
        currentPosition={toolbarPosition}
        chaptersCount={chaptersCount}
        pageLabel={pageLabel}
        bookProgress={bookProgress}
        chapterProgress={chapterProgress}
        isTocOpen={isTocOpen}
        onToggleToc={handleToggleToc}
        onOpenSearch={handleOpenSearch}
        onOpenNotes={handleOpenNotes}
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
        onAskSelection={handleAskSelection}
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
        position={toolbarPosition ?? FIRST_CHAPTER_POSITION}
        offset={page?.startOffset ?? 0}
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
          onAsk={handleAskSelection}
        />
      )}

      {returnPoint !== null && (
        <div className={styles.returnBar} role="status">
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
