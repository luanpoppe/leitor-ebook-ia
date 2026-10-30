"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { AppShell } from "@/features/shelf/components/app-shell";
import {
  noteChapterLabel,
  noteExcerpt,
} from "@/features/reader/notes/note-format";
import type { AllBookNote } from "@/features/reader/notes/api";
import { useAllNotes } from "../use-all-notes";
import { NotePreviewDialog } from "./note-preview-dialog";
import styles from "./notes-page.module.css";

interface BookFilter {
  id: string;
  title: string;
  author: string | null;
  count: number;
}

export function NotesPage(): JSX.Element {
  const { notes, isLoading, error, reload } = useAllNotes();
  const [selectedBookId, setSelectedBookId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<AllBookNote | null>(null);

  const books = useMemo<BookFilter[]>(() => {
    const byId = new Map<string, BookFilter>();

    for (const note of notes) {
      const current = byId.get(note.book.id);
      if (current === undefined) {
        byId.set(note.book.id, {
          id: note.book.id,
          title: note.book.title,
          author: note.book.author,
          count: 1,
        });
        continue;
      }

      byId.set(note.book.id, { ...current, count: current.count + 1 });
    }

    return [...byId.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR")
    );
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

    return notes.filter((note) => {
      const matchesBook =
        selectedBookId.length === 0 || note.book.id === selectedBookId;
      if (!matchesBook) return false;
      if (normalizedQuery.length === 0) return true;

      const searchableText = [
        note.title,
        note.content,
        note.book.title,
        note.book.author ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(normalizedQuery);
    });
  }, [notes, query, selectedBookId]);

  const handleBookChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBookId(event.target.value);
  };

  return (
    <AppShell active="notes">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca pessoal</p>
          <h1 className={styles.title}>Anotações</h1>
          <p className={styles.subtitle}>
            Tudo o que você e a IA salvaram, por livro.
          </p>
        </div>

        {!isLoading && error === null && (
          <span className={styles.count}>
            {notes.length} {notes.length === 1 ? "anotação" : "anotações"}
          </span>
        )}
      </header>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Livro</span>
          <select
            value={selectedBookId}
            onChange={handleBookChange}
            className={styles.select}
          >
            <option value="">Todos os livros ({notes.length})</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title} ({book.count})
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Título, conteúdo ou livro…"
            className={styles.input}
          />
        </label>
      </div>

      {isLoading && <p className={styles.status}>Carregando anotações…</p>}

      {!isLoading && error !== null && (
        <div className={styles.statusBox}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}

      {!isLoading && error === null && notes.length === 0 && (
        <p className={styles.empty}>
          Nenhuma anotação ainda. Crie uma no leitor ou peça à IA no chat.
        </p>
      )}

      {!isLoading &&
        error === null &&
        notes.length > 0 &&
        filteredNotes.length === 0 && (
          <p className={styles.empty}>
            Nenhuma anotação encontrada com esses filtros.
          </p>
        )}

      {filteredNotes.length > 0 && (
        <ul className={styles.grid}>
          {filteredNotes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                className={styles.card}
                onClick={() => setSelectedNote(note)}
              >
                <span className={styles.cardBook}>{note.book.title}</span>
                <span className={styles.cardTitle}>{note.title}</span>
                <span className={styles.cardMeta}>
                  {noteChapterLabel(note.chapterPosition)} ·{" "}
                  {formatDate(note.updatedAt)}
                </span>
                <span className={styles.cardExcerpt}>
                  {noteExcerpt(note.content)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedNote !== null && (
        <NotePreviewDialog
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
        />
      )}
    </AppShell>
  );
}
