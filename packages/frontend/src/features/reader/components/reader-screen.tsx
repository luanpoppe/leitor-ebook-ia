"use client";

import { useCallback, useState } from "react";
import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useReader } from "../use-reader";
import { useReaderKeyboard } from "../use-reader-keyboard";
import { useReaderPage, type ReaderPageMetrics } from "../use-reader-page";
import { useReaderPreferences } from "../use-reader-preferences";
import { useReadingProgressWriter } from "../use-reading-progress-writer";
import { ReaderErrorMessage } from "./reader-error-message";
import { ReaderFooterNotice } from "./reader-footer-notice";
import { ReaderMessage } from "./reader-message";
import { ReaderPageInteraction } from "./reader-page-interaction";
import { ReaderPageView } from "./reader-page-view";
import { ReaderTocDrawer } from "./reader-toc-drawer";
import { ReaderToolbar } from "./reader-toolbar";
import styles from "./reader-screen.module.css";
import messageStyles from "./reader-message.module.css";

const FIRST_CHAPTER_POSITION = 1;
const CHUNK_ERROR_MESSAGE = "Falha ao carregar o trecho do capítulo.";
// O carregamento cobre a área sem desmontar a view que a mede.
const PAGE_LOADING_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

interface ReaderScreenProps {
  bookId: string;
  initialChapterPosition: number | null;
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
    canIncrease,
    canDecrease,
    increaseFont,
    decreaseFont,
    toggleTheme,
  } = useReaderPreferences();
  const { scheduleSave } = useReadingProgressWriter(bookId, savedProgress);
  const { ebook } = useEbookDetail(bookId);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [metrics, setMetrics] = useState<ReaderPageMetrics | null>(null);
  // Capítulo que abre na última página: voltar do começo do capítulo seguinte.
  const [landAtEndPosition, setLandAtEndPosition] = useState<number | null>(
    null
  );

  // A view mede a área e publica a régua; uma identidade nova a cada render
  // dispararia repaginação em loop.
  const handleMetricsChange = useCallback((nextMetrics: ReaderPageMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const isLandingAtChapterEnd =
    chapter !== null && landAtEndPosition === chapter.position;
  const initialOffset = isLandingAtChapterEnd
    ? chapter.totalLength
    : resumeOffset;

  const handlePageChange = useCallback(
    (position: number, offset: number) => {
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  const handleTurnPastEnd = useCallback(() => {
    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    setLandAtEndPosition(null);
    goNext();
    setHasReachedEnd(false);
  }, [goNext, hasNext]);

  const handleTurnPastStart = useCallback(() => {
    const previousPosition = chapter?.previousPosition ?? null;
    if (!hasPrevious || previousPosition === null) return;

    setLandAtEndPosition(previousPosition);
    goPrevious();
    setHasReachedEnd(false);
  }, [chapter, goPrevious, hasPrevious]);

  const {
    page,
    pageIndex,
    totalPages,
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
    setLandAtEndPosition(null);

    if (hasNext) {
      goNext();
      setHasReachedEnd(false);
      return;
    }

    setHasReachedEnd(true);
  }, [goNext, hasNext]);

  const handlePreviousChapter = useCallback(() => {
    setLandAtEndPosition(null);
    setHasReachedEnd(false);
    goPrevious();
  }, [goPrevious]);

  const handleToggleToc = useCallback(() => {
    setIsTocOpen((isOpen) => !isOpen);
  }, []);

  const handleCloseToc = useCallback(() => {
    setIsTocOpen(false);
  }, []);

  const handleSelectChapter = useCallback(
    (position: number) => {
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

  const handleOpenFirstChapter = useCallback(() => {
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    // Livro de um capítulo só: o capítulo já é o primeiro, então recomeça nele.
    if (currentPosition === firstChapterPosition) {
      restartChapter();
      return;
    }

    goToChapter(firstChapterPosition);
  }, [currentPosition, firstChapterPosition, goToChapter, restartChapter]);

  const readerTitle = ebook?.title ?? "Leitura";
  const backHref = `/ebooks/${bookId}`;
  const chaptersCount = chapters.length;
  const pageLabel =
    page === null ? null : `Página ${pageIndex + 1} de ${totalPages}`;
  const chapterProgress =
    chapter === null
      ? 0
      : resolveChapterProgress(page?.startOffset ?? 0, chapter.totalLength);

  const isReadingBlocked =
    hasReachedEnd || errorKind !== null || pageError !== null || chapter === null;
  const isChunkErrorVisible =
    pageError !== null && errorKind === null && !hasReachedEnd;
  // Falha tem o aviso do rodapé; página nula sem falha é carga em andamento.
  const isPagePending =
    chapter !== null && page === null && pageError === null;

  useReaderKeyboard({
    isTocOpen,
    isReadingBlocked,
    onCloseToc: handleCloseToc,
    onNext: goToNextPage,
    onPrevious: goToPreviousPage,
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

    // Erro e fim do livro já saíram acima; sem capítulo e sem erro, ainda
    // estamos abrindo o livro — inclusive se a query ainda nem começou.
    if (chapter === null) {
      return (
        <div className={styles.loading} aria-live="polite">
          <p className={styles.loadingText}>Carregando livro…</p>
        </div>
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
          pageKey={`${chapter.position}:${pageIndex}`}
          direction={direction}
          fontSize={fontSize}
          theme={theme}
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
        currentPosition={currentPosition}
        chaptersCount={chaptersCount}
        pageLabel={pageLabel}
        chapterProgress={chapterProgress}
        isTocOpen={isTocOpen}
        onToggleToc={handleToggleToc}
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
      />

      <main className={styles.main}>
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
          currentPosition={currentPosition}
          onSelect={handleSelectChapter}
          onClose={handleCloseToc}
        />
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
