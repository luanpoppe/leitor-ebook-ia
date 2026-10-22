"use client";

import Link from "next/link";
import { formatDate, formatExtension } from "@/features/ebooks/format";
import type { EbookSummary } from "@/features/ebooks/types";
import { BookCover } from "./book-cover";
import { StatusMark } from "./status-mark";
import styles from "./book-grid.module.css";

interface BookCardProps {
  ebook: EbookSummary;
  isHighlighted: boolean;
  isReprocessing: boolean;
  onOpen: (id: string) => void;
  onReprocess: (id: string) => void;
}

export function BookCard({
  ebook,
  isHighlighted,
  isReprocessing,
  onOpen,
  onReprocess,
}: BookCardProps) {
  const isFailed = ebook.status === "failed";
  const isReady = ebook.status === "ready";
  const readingHref = `/ebooks/${ebook.id}/ler`;

  const cardClassName = [
    styles.card,
    isHighlighted ? styles.cardHighlighted : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleOpen = () => onOpen(ebook.id);
  const handleReprocess = () => onReprocess(ebook.id);

  return (
    <article className={cardClassName} data-book-id={ebook.id}>
      <button
        type="button"
        onClick={handleOpen}
        className={styles.cardButton}
        aria-label={`Abrir ${ebook.title}`}
      >
        <BookCover
          title={ebook.title}
          coverUrl={ebook.coverUrl}
          format={ebook.format}
        />

        <span className={styles.cardBody}>
          <span className={styles.cardTitle}>{ebook.title}</span>

          {ebook.author && (
            <span className={styles.cardAuthor}>{ebook.author}</span>
          )}

          <span className={styles.cardMeta}>
            {formatExtension(ebook.format)} · {formatDate(ebook.createdAt)}
          </span>

          <span className={styles.cardStatus}>
            <StatusMark status={ebook.status} />
          </span>
        </span>
      </button>

      {isReady && (
        <Link
          href={readingHref}
          className={styles.readLink}
          aria-label={`Ler ${ebook.title}`}
        >
          Ler
        </Link>
      )}

      {isFailed && (
        <button
          type="button"
          onClick={handleReprocess}
          disabled={isReprocessing}
          className={styles.retryText}
        >
          {isReprocessing ? "Enviando..." : "Tentar de novo"}
        </button>
      )}
    </article>
  );
}
