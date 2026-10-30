"use client";

import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import type { BookNote } from "./api";
import { noteChapterLabel, noteExcerpt } from "./note-format";
import styles from "./notes.module.css";

interface NoteListProps {
  notes: BookNote[];
  onSelect(note: BookNote): void;
}

export function NoteList({ notes, onSelect }: NoteListProps): JSX.Element {
  return (
    <ul className={styles.noteList}>
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            className={styles.noteItem}
            onClick={() => onSelect(note)}
          >
            <span className={styles.noteItemTitle}>{note.title}</span>
            <span className={styles.noteItemMeta}>
              {noteChapterLabel(note.chapterPosition)} ·{" "}
              {formatDate(note.updatedAt)}
            </span>
            <span className={styles.noteItemExcerpt}>
              {noteExcerpt(note.content)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
