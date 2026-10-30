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

  const cardContent = (
    <>
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
    </>
  );

  return (
    <article className={cardClassName} data-book-id={ebook.id}>
      {/* O cartão inteiro é o atalho de leitura: clicar no livro abre o
          leitor. Livro que ainda não está pronto abre os detalhes, pois não
          há texto para ler. */}
      {isReady ? (
        <Link
          href={readingHref}
          className={styles.cardButton}
          aria-label={`Ler ${ebook.title}`}
        >
          {cardContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={styles.cardButton}
          aria-label={`Ver detalhes de ${ebook.title}`}
        >
          {cardContent}
        </button>
      )}

      {isReady && (
        <button
          type="button"
          onClick={handleOpen}
          className={styles.readLink}
          aria-label={`Ver detalhes de ${ebook.title}`}
        >
          Detalhes
        </button>
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
