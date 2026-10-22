"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useDialogPanel } from "../hooks/use-dialog-panel";
import { BookCover } from "./book-cover";
import { DetailFacts } from "./detail-facts";
import { StatusMark } from "./status-mark";
import styles from "./detail.module.css";

interface BookDetailDialogProps {
  bookId: string;
  onClose: () => void;
  onReprocess: (id: string) => void;
  isReprocessing: boolean;
}

export function BookDetailDialog({
  bookId,
  onClose,
  onReprocess,
  isReprocessing,
}: BookDetailDialogProps) {
  const { ebook, isLoading, notFound, errorMessage, refetch } =
    useEbookDetail(bookId);
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);

  const handleReprocess = () => onReprocess(bookId);
  const handleDialogClick = (event: ReactMouseEvent) => event.stopPropagation();

  const renderBody = () => {
    if (isLoading) {
      return <p className={styles.loading}>Carregando ebook...</p>;
    }

    if (notFound) {
      return <p className={styles.loading}>Ebook não encontrado.</p>;
    }

    if (!ebook) {
      return (
        <div className={styles.dialogBody}>
          <p className={styles.errorText}>
            {errorMessage ?? "Não foi possível carregar o ebook."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className={styles.secondaryButton}
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    const isFailed = ebook.status === "failed";

    return (
      <>
        <div className={styles.dialogHeader}>
          <BookCover
            title={ebook.title}
            coverUrl={ebook.coverUrl}
            format={ebook.format}
            variant="lead"
          />

          <div className={styles.dialogHeaderBody}>
            <h2 className={styles.dialogTitle}>{ebook.title}</h2>
            {ebook.author && (
              <p className={styles.dialogAuthor}>{ebook.author}</p>
            )}
            <p className={styles.dialogStatus}>
              <StatusMark status={ebook.status} variant="pill" />
            </p>
          </div>
        </div>

        <div className={styles.dialogBody}>
          <DetailFacts ebook={ebook} />

          {ebook.errorMessage && (
            <p className={styles.errorBox}>{ebook.errorMessage}</p>
          )}

          <div className={styles.dialogActions}>
            {isFailed && (
              <button
                type="button"
                onClick={handleReprocess}
                disabled={isReprocessing}
                className={styles.primaryButton}
              >
                {isReprocessing ? "Enviando..." : "Tentar de novo"}
              </button>
            )}

            <Link
              href={`/ebooks/${ebook.id}`}
              onClick={onClose}
              className={styles.secondaryButton}
            >
              Abrir página do livro
            </Link>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do livro"
        className={styles.dialog}
        onClick={handleDialogClick}
        onKeyDown={handleKeyDown}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className={styles.closeButton}
        >
          Fechar
        </button>

        {renderBody()}
      </div>
    </div>
  );
}
