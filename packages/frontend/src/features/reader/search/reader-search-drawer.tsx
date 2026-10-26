"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import { getApiErrorInfo } from "@/features/ebooks/api";
import { searchBook, type BookSearchItem } from "./api";
import styles from "./reader-search-drawer.module.css";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

interface ReaderSearchDrawerProps {
  bookId: string;
  onClose(): void;
  onSelect(chapterPosition: number, offset: number): void;
}

/**
 * Busca textual no livro. A consulta é debounced e o backend usa FTS do
 * Postgres (sem diferenciar maiúsculas); o trecho volta com contexto.
 */
export function ReaderSearchDrawer({
  bookId,
  onClose,
  onSelect,
}: ReaderSearchDrawerProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BookSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setItems([]);
      setError(null);
      setHasSearched(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      void runSearch(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);

    async function runSearch(term: string): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const results = await searchBook(bookId, term);
        setItems(results);
        setHasSearched(true);
      } catch (cause) {
        setError(getApiErrorInfo(cause).message);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [bookId, query]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
  };

  return (
    <div className={styles.layer}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      <section
        className={styles.panel}
        role="dialog"
        aria-label="Buscar no livro"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Buscar no livro</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite uma palavra ou frase…"
            className={styles.input}
            aria-label="Termo de busca"
          />
        </form>

        <div className={styles.results}>
          {isLoading && <p className={styles.status}>Buscando…</p>}

          {!isLoading && error !== null && (
            <p className={styles.error}>{error}</p>
          )}

          {!isLoading && error === null && hasSearched && items.length === 0 && (
            <p className={styles.status}>Nenhuma ocorrência encontrada.</p>
          )}

          {items.map((item) => (
            <button
              key={`${item.chapterPosition}:${item.offset}`}
              type="button"
              className={styles.result}
              onClick={() => onSelect(item.chapterPosition, item.offset)}
            >
              <span className={styles.resultChapter}>
                {item.chapterTitle ?? `Capítulo ${item.chapterPosition}`}
              </span>
              <span className={styles.resultSnippet}>
                {highlight(item.snippet, query)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Marca as ocorrências do termo no trecho, sem alterar o texto. */
function highlight(snippet: string, query: string): JSX.Element[] {
  const term = query.trim();
  if (term.length === 0) return [<span key="all">{snippet}</span>];

  const lowerSnippet = snippet.toLocaleLowerCase("pt-BR");
  const lowerTerm = term.toLocaleLowerCase("pt-BR");
  const parts: JSX.Element[] = [];
  let cursor = 0;

  while (cursor < snippet.length) {
    const index = lowerSnippet.indexOf(lowerTerm, cursor);
    if (index < 0) {
      parts.push(
        <span key={`text-${cursor}`}>{snippet.slice(cursor)}</span>
      );
      break;
    }

    if (index > cursor) {
      parts.push(
        <span key={`text-${cursor}`}>{snippet.slice(cursor, index)}</span>
      );
    }
    parts.push(
      <mark key={`mark-${index}`} className={styles.mark}>
        {snippet.slice(index, index + term.length)}
      </mark>
    );
    cursor = index + term.length;
  }

  return parts;
}
