"use client";

/* As imagens do dicionário vêm do backend dinâmico; não passam pelo otimizador
   do next/image. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { getApiBaseUrl } from "@/utils/http";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import type { DictionaryEntry } from "../api";
import styles from "./word-preview-dialog.module.css";

interface WordPreviewDialogProps {
  entry: DictionaryEntry;
  onClose(): void;
}

export function WordPreviewDialog({
  entry,
  onClose,
}: WordPreviewDialogProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const chapter = entry.chapterPosition;
  const readingHref =
    entry.book === null
      ? null
      : chapter === null
        ? `/ebooks/${entry.book.id}/ler`
        : `/ebooks/${entry.book.id}/ler?capitulo=${chapter}`;
  const chapterLabel =
    chapter === null ? "Livro todo" : `Capítulo ${chapter}`;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Palavra do dicionário"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.kicker}>Dicionário pessoal</span>
            <h2 className={styles.word}>{entry.word}</h2>
            <span className={styles.meta}>
              {entry.book === null ? "Sem livro de origem" : entry.book.title}
              {entry.book !== null && ` · ${chapterLabel}`} · atualizada em{" "}
              {formatDate(entry.updatedAt)}
            </span>
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

        <div className={styles.body}>
          {entry.imageUrl !== null && (
            <img
              src={`${getApiBaseUrl()}${entry.imageUrl}`}
              alt={`Imagem ilustrativa de ${entry.word}`}
              className={styles.image}
            />
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Significado</h3>
            <p className={styles.meaning}>{entry.meaning}</p>
          </section>

          {entry.example !== null && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Exemplo</h3>
              <p className={styles.example}>{entry.example}</p>
            </section>
          )}

          {entry.quote !== null && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>No livro</h3>
              <blockquote className={styles.quote}>{entry.quote}</blockquote>
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          {readingHref !== null && (
            <Link href={readingHref} className={styles.readButton}>
              {chapter === null
                ? "Abrir no livro"
                : `Abrir no capítulo ${chapter}`}
            </Link>
          )}
        </footer>
      </article>
    </div>
  );
}
