"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { AppShell } from "@/features/shelf/components/app-shell";
import type { DictionaryEntry } from "../api";
import { useDictionary } from "../use-dictionary";
import { WordPreviewDialog } from "./word-preview-dialog";
import styles from "./dictionary-page.module.css";

interface BookFilter {
  id: string;
  title: string;
  author: string | null;
  count: number;
}

export function DictionaryPage(): JSX.Element {
  const { entries, isLoading, error, reload } = useDictionary();
  const [selectedBookId, setSelectedBookId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(
    null
  );

  const books = useMemo<BookFilter[]>(() => {
    const byId = new Map<string, BookFilter>();

    for (const entry of entries) {
      if (entry.book === null) continue;

      const current = byId.get(entry.book.id);
      if (current === undefined) {
        byId.set(entry.book.id, {
          id: entry.book.id,
          title: entry.book.title,
          author: entry.book.author,
          count: 1,
        });
        continue;
      }

      byId.set(entry.book.id, { ...current, count: current.count + 1 });
    }

    return [...byId.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR")
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

    return entries.filter((entry) => {
      const matchesBook =
        selectedBookId.length === 0 ||
        (entry.book !== null && entry.book.id === selectedBookId);
      if (!matchesBook) return false;
      if (normalizedQuery.length === 0) return true;

      const searchableText = [
        entry.word,
        entry.meaning,
        entry.book?.title ?? "",
        entry.book?.author ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(normalizedQuery);
    });
  }, [entries, query, selectedBookId]);

  const handleBookChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBookId(event.target.value);
  };

  return (
    <AppShell active="dictionary">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca pessoal</p>
          <h1 className={styles.title}>Dicionário</h1>
          <p className={styles.subtitle}>
            Palavras que você salvou, com o significado e o contexto do livro.
          </p>
        </div>

        {!isLoading && error === null && (
          <span className={styles.count}>
            {entries.length} {entries.length === 1 ? "palavra" : "palavras"}
          </span>
        )}
      </header>

      <p className={styles.hint}>
        Para adicionar, peça no chat enquanto lê:{" "}
        <em>“Adiciona a palavra X ao dicionário.”</em>
      </p>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Livro</span>
          <select
            value={selectedBookId}
            onChange={handleBookChange}
            className={styles.select}
          >
            <option value="">Todos os livros ({entries.length})</option>
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
            placeholder="Palavra, significado ou livro…"
            className={styles.input}
          />
        </label>
      </div>

      {isLoading && <p className={styles.status}>Carregando dicionário…</p>}

      {!isLoading && error !== null && (
        <div className={styles.statusBox}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}

      {!isLoading && error === null && entries.length === 0 && (
        <p className={styles.empty}>
          Nenhuma palavra ainda. Peça no chat, durante a leitura, para
          adicionar o primeiro termo.
        </p>
      )}

      {!isLoading &&
        error === null &&
        entries.length > 0 &&
        filteredEntries.length === 0 && (
          <p className={styles.empty}>
            Nenhuma palavra encontrada com esses filtros.
          </p>
        )}

      {filteredEntries.length > 0 && (
        <ul className={styles.grid}>
          {filteredEntries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={styles.card}
                onClick={() => setSelectedEntry(entry)}
              >
                <span className={styles.cardWord}>{entry.word}</span>
                <span className={styles.cardMeaning}>
                  {truncate(entry.meaning)}
                </span>
                <span className={styles.cardMeta}>
                  {entry.book === null
                    ? "Sem livro de origem"
                    : entry.book.title}
                  {entry.chapterPosition !== null &&
                    ` · capítulo ${entry.chapterPosition}`}
                  {" · "}
                  {formatDate(entry.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedEntry !== null && (
        <WordPreviewDialog
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </AppShell>
  );
}

function truncate(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;

  return `${normalized.slice(0, 160).trimEnd()}…`;
}
