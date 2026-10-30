"use client";

import Link from "next/link";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import type { AllBookNote } from "@/features/reader/notes/api";
import { noteChapterLabel } from "@/features/reader/notes/note-format";
import { NoteMarkdown } from "@/features/reader/notes/note-markdown";
import styles from "./note-preview-dialog.module.css";

interface NotePreviewDialogProps {
  note: AllBookNote;
  onClose(): void;
}

export function NotePreviewDialog({
  note,
  onClose,
}: NotePreviewDialogProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const chapter = note.chapterPosition;
  const readingHref =
    chapter === null
      ? `/ebooks/${note.book.id}/ler`
      : `/ebooks/${note.book.id}/ler?capitulo=${chapter}`;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Anotação"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.book}>{note.book.title}</span>
            <h2 className={styles.title}>{note.title}</h2>
            <span className={styles.meta}>
              {noteChapterLabel(chapter)} · atualizada em{" "}
              {formatDate(note.updatedAt)}
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
          <NoteMarkdown content={note.content} />
        </div>

        <footer className={styles.footer}>
          <Link href={readingHref} className={styles.readButton}>
            {chapter === null
              ? "Abrir no livro"
              : `Abrir no capítulo ${chapter}`}
          </Link>
        </footer>
      </article>
    </div>
  );
}
