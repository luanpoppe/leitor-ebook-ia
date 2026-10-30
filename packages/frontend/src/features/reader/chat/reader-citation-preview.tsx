"use client";

import { useCallback, useState } from "react";
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import { ReaderPageView } from "../components/reader-page-view";
import type { ReaderTheme } from "../reader-preferences";
import type { ReaderAlignment } from "../reader-preferences";
import { useReaderPage, type ReaderPageMetrics } from "../use-reader-page";
import { describeCitation } from "./chat-message-text";
import type { ChatCitation } from "./types";
import styles from "./reader-citation-preview.module.css";

const NOOP = (): void => {};

interface ReaderCitationPreviewProps {
  bookId: string;
  citation: ChatCitation;
  fontSize: number;
  theme: ReaderTheme;
  alignment: ReaderAlignment;
  onClose(): void;
  /** Leva a leitura principal para a página que está aberta no modal. */
  onGoToReading(citation: ChatCitation): void;
}

/**
 * Prévia do trecho citado: pagina o capítulo da citação em um modal, sem mexer
 * na posição da leitura principal. O leitor pode folhear ali e só então decidir
 * ir para o trecho.
 */
export function ReaderCitationPreview({
  bookId,
  citation,
  fontSize,
  theme,
  alignment,
  onClose,
  onGoToReading,
}: ReaderCitationPreviewProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const [metrics, setMetrics] = useState<ReaderPageMetrics | null>(null);

  const handleMetricsChange = useCallback(
    (nextMetrics: ReaderPageMetrics) => setMetrics(nextMetrics),
    []
  );

  const {
    page,
    pageIndex,
    totalPages,
    direction,
    error,
    isAtChapterStart,
    isAtChapterEnd,
    goToNextPage,
    goToPreviousPage,
    retry,
  } = useReaderPage({
    bookId,
    position: citation.chapterPosition,
    initialOffset: citation.offset,
    metrics,
    enabled: metrics !== null,
    onTurnPastEnd: NOOP,
    onTurnPastStart: NOOP,
    onPageChange: NOOP,
  });

  const handlePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      handleKeyDown(event);

      const isPrevious = event.key === "ArrowLeft";
      if (isPrevious) {
        event.preventDefault();
        goToPreviousPage();
        return;
      }

      const isNext = event.key === "ArrowRight";
      if (!isNext) return;

      event.preventDefault();
      goToNextPage();
    },
    [goToNextPage, goToPreviousPage, handleKeyDown]
  );

  const handleGoToReading = useCallback(() => {
    const targetPage = page;
    const offset = targetPage?.startOffset ?? citation.offset;
    onGoToReading({ ...citation, offset });
  }, [citation, onGoToReading, page]);

  const isPagePending = page === null && error === null;
  const pageLabel = `${pageIndex + 1} de ${Math.max(totalPages, 1)}`;

  return (
    <div className={styles.layer}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Trecho citado"
        ref={dialogRef}
        onKeyDown={handlePanelKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <h2 className={styles.title}>Trecho citado</h2>
            <p className={styles.caption}>{describeCitation(citation)}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        {citation.snippet !== undefined && (
          <div className={styles.snippet}>
            <span className={styles.snippetLabel}>Trecho enviado à IA</span>
            <p className={styles.snippetText}>{citation.snippet}</p>
          </div>
        )}

        <div className={styles.pageArea}>
          <ReaderPageView
            page={page}
            position={citation.chapterPosition}
            highlights={[]}
            pageKey={`${citation.chapterPosition}:${pageIndex}`}
            direction={direction}
            fontSize={fontSize}
            theme={theme}
            alignment={alignment}
            onMetricsChange={handleMetricsChange}
          />

          {isPagePending && (
            <p className={styles.status} aria-live="polite">
              Carregando trecho…
            </p>
          )}

          {error !== null && (
            <div className={styles.error} role="status">
              <span>Não foi possível carregar o trecho.</span>
              <button
                type="button"
                className={styles.smallButton}
                onClick={retry}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.pageButton}
              onClick={goToPreviousPage}
              disabled={isAtChapterStart}
              aria-label="Página anterior"
            >
              ←
            </button>
            <span className={styles.pageLabel}>{pageLabel}</span>
            <button
              type="button"
              className={styles.pageButton}
              onClick={goToNextPage}
              disabled={isAtChapterEnd}
              aria-label="Próxima página"
            >
              →
            </button>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleGoToReading}
          >
            Ir para esta parte na leitura
          </button>
        </footer>
      </section>
    </div>
  );
}
