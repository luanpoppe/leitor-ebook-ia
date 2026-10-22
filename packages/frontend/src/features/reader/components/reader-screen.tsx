"use client";

import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import Link from "next/link";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useReader } from "../use-reader";
import { useReaderKeyboard } from "../use-reader-keyboard";
import { useReaderPreferences } from "../use-reader-preferences";
import { useReadingProgressWriter } from "../use-reading-progress-writer";
import { ReaderChapterView } from "./reader-chapter-view";
import { ReaderErrorMessage } from "./reader-error-message";
import { ReaderMessage } from "./reader-message";
import { ReaderTocDrawer } from "./reader-toc-drawer";
import { ReaderToolbar } from "./reader-toolbar";
import styles from "./reader-screen.module.css";
import messageStyles from "./reader-message.module.css";

const FIRST_CHAPTER_POSITION = 1;

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
  const [lastOffset, setLastOffset] = useState(0);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);

  const firstChapterPosition =
    chapters[0]?.position ?? FIRST_CHAPTER_POSITION;

  // Cada capítulo novo começa do ponto de retomada que o leitor informou.
  useEffect(() => {
    setLastOffset(resumeOffset);
  }, [chapter?.id, resumeOffset]);

  const handlePositionChange = useCallback(
    (position: number, offset: number) => {
      setLastOffset(offset);
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  const handleNext = useCallback(() => {
    if (hasNext) {
      goNext();
      setHasReachedEnd(false);
      return;
    }

    setHasReachedEnd(true);
  }, [goNext, hasNext]);

  const handlePrevious = useCallback(() => {
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
      goToChapter(position);
      setIsTocOpen(false);
      setHasReachedEnd(false);
    },
    [goToChapter]
  );

  const handleOpenFirstChapter = useCallback(() => {
    goToChapter(firstChapterPosition);
    setHasReachedEnd(false);
  }, [firstChapterPosition, goToChapter]);

  const readerTitle = ebook?.title ?? "Leitura";
  const backHref = `/ebooks/${bookId}`;
  const chaptersCount = chapters.length;
  const chapterProgress =
    chapter === null
      ? 0
      : resolveChapterProgress(lastOffset, chapter.totalLength);

  useReaderKeyboard({
    isTocOpen,
    isReadingBlocked: hasReachedEnd || errorKind !== null,
    onCloseToc: handleCloseToc,
    onNext: handleNext,
    onPrevious: handlePrevious,
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
    const isOpeningBook = chapter === null;
    if (isOpeningBook) {
      return (
        <div className={styles.loading} aria-live="polite">
          <p className={styles.loadingText}>Carregando livro…</p>
        </div>
      );
    }

    if (chapter === null) return null;

    return (
      <ReaderChapterView
        chapter={chapter}
        fontSize={fontSize}
        theme={theme}
        resumeOffset={resumeOffset}
        onPositionChange={handlePositionChange}
      />
    );
  };

  return (
    <div className={styles.screen} data-theme={theme}>
      <ReaderToolbar
        bookTitle={readerTitle}
        backHref={backHref}
        currentPosition={currentPosition}
        chaptersCount={chaptersCount}
        chapterProgress={chapterProgress}
        isTocOpen={isTocOpen}
        onToggleToc={handleToggleToc}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={handlePrevious}
        onNext={handleNext}
        fontSize={fontSize}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        onDecreaseFont={decreaseFont}
        onIncreaseFont={increaseFont}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className={styles.main}>{renderBody()}</main>

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
