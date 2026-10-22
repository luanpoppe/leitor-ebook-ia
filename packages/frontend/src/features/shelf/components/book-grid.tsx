"use client";

import type { EbookSummary } from "@/features/ebooks/types";
import { BookCard } from "./book-card";
import styles from "./book-grid.module.css";

const SKELETON_CARDS = 4;

interface BookGridProps {
  ebooks: EbookSummary[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  highlightedId: string | null;
  isReprocessingFor: (id: string) => boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onReprocess: (id: string) => void;
  onUpload: () => void;
  hasNextPage: boolean;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
}

export function BookGrid({
  ebooks,
  isLoading,
  isError,
  errorMessage,
  highlightedId,
  isReprocessingFor,
  onRetry,
  onOpen,
  onReprocess,
  onUpload,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: BookGridProps) {
  if (isLoading) {
    return (
      <div className={styles.grid} aria-busy="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <div key={index} className={styles.skeletonCard}>
            <div className={styles.skeletonCover} />
            <div className={styles.skeletonLine} />
            <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          </div>
        ))}
      </div>
    );
  }

  if (isError && ebooks.length === 0) {
    return (
      <div className={styles.errorBox} role="alert">
        <p className={styles.errorText}>Não foi possível carregar a estante.</p>
        {errorMessage && <p className={styles.errorDetail}>{errorMessage}</p>}
        <button type="button" onClick={onRetry} className={styles.retryButton}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (ebooks.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Sua estante está vazia.</p>
        <p className={styles.emptyHint}>
          Envie o primeiro EPUB, PDF, TXT ou MD e acompanhe a preparação até o
          livro ficar pronto para abrir.
        </p>
        <button type="button" onClick={onUpload} className={styles.emptyAction}>
          Enviar o primeiro livro
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {ebooks.map((ebook) => (
          <BookCard
            key={ebook.id}
            ebook={ebook}
            isHighlighted={ebook.id === highlightedId}
            isReprocessing={isReprocessingFor(ebook.id)}
            onOpen={onOpen}
            onReprocess={onReprocess}
          />
        ))}
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className={styles.loadMore}
        >
          {isFetchingNextPage ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </>
  );
}
