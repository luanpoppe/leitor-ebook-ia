"use client";

import { useState } from "react";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { CopyNoteButton } from "@/features/notes/components/copy-note-button";
import type { BookNote } from "./api";
import { noteChapterLabel } from "./note-format";
import { NoteMarkdown } from "./note-markdown";
import styles from "./notes.module.css";

interface NoteDetailProps {
  note: BookNote;
  isDeleting: boolean;
  error: string | null;
  onEdit(): void;
  onDelete(): void;
  onGoToChapter(position: number): void;
}

export function NoteDetail({
  note,
  isDeleting,
  error,
  onEdit,
  onDelete,
  onGoToChapter,
}: NoteDetailProps): JSX.Element {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const chapterPosition = note.chapterPosition;
  const handleAskDelete = () => setIsConfirmingDelete(true);
  const handleCancelDelete = () => setIsConfirmingDelete(false);
  const handleConfirmDelete = () => {
    setIsConfirmingDelete(false);
    onDelete();
  };

  return (
    <article className={styles.detail}>
      <h3 className={styles.detailTitle}>{note.title}</h3>

      <p className={styles.detailMeta}>
        {noteChapterLabel(note.chapterPosition)} · atualizada em{" "}
        {formatDate(note.updatedAt)}
      </p>

      {chapterPosition !== null && (
        <button
          type="button"
          className={styles.chapterLink}
          onClick={() => onGoToChapter(chapterPosition)}
        >
          Ir para o capítulo {chapterPosition}
        </button>
      )}

      <NoteMarkdown content={note.content} />

      {error !== null && <p className={styles.error}>{error}</p>}

      {isConfirmingDelete ? (
        <div className={styles.confirmDelete}>
          <p className={styles.confirmText}>Excluir esta anotação?</p>
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleCancelDelete}
              disabled={isDeleting}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actionsRow}>
          <CopyNoteButton content={note.content} />
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onEdit}
          >
            Editar
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleAskDelete}
          >
            Excluir
          </button>
        </div>
      )}
    </article>
  );
}
