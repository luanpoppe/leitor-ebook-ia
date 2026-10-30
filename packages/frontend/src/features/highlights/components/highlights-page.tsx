"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import Link from "next/link";
import { formatDate } from "@/features/ebooks/format";
import { getApiErrorInfo } from "@/features/ebooks/api";
import { AppShell } from "@/features/shelf/components/app-shell";
import type {
  AllBookHighlight,
  HighlightColor,
} from "@/features/highlights/api";
import {
  HIGHLIGHT_COLOR_OPTIONS,
  resolveHighlightColorLabel,
} from "@/features/highlights/highlight-colors";
import { useAllHighlights } from "@/features/highlights/use-all-highlights";
import styles from "./highlights-page.module.css";

type ColorFilter = HighlightColor | "all";

interface BookFilter {
  id: string;
  title: string;
  author: string | null;
  count: number;
}

export function HighlightsPage(): JSX.Element {
  const { highlights, isLoading, error, reload, remove } = useAllHighlights();
  const [selectedBookId, setSelectedBookId] = useState("");
  const [selectedColor, setSelectedColor] = useState<ColorFilter>("all");
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const books = useMemo<BookFilter[]>(() => {
    const byId = new Map<string, BookFilter>();

    for (const highlight of highlights) {
      const current = byId.get(highlight.book.id);
      if (current === undefined) {
        byId.set(highlight.book.id, {
          id: highlight.book.id,
          title: highlight.book.title,
          author: highlight.book.author,
          count: 1,
        });
        continue;
      }

      byId.set(highlight.book.id, { ...current, count: current.count + 1 });
    }

    return [...byId.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR")
    );
  }, [highlights]);

  const filteredHighlights = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

    return highlights.filter((highlight) => {
      const matchesBook =
        selectedBookId.length === 0 || highlight.book.id === selectedBookId;
      const matchesColor =
        selectedColor === "all" || highlight.color === selectedColor;
      if (!matchesBook || !matchesColor) return false;
      if (normalizedQuery.length === 0) return true;

      const searchableText = [
        highlight.quote,
        highlight.book.title,
        highlight.book.author ?? "",
        `capítulo ${highlight.chapterPosition}`,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(normalizedQuery);
    });
  }, [highlights, query, selectedBookId, selectedColor]);

  const handleBookChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBookId(event.target.value);
  };

  const handleRemove = async (highlight: AllBookHighlight): Promise<void> => {
    setRemovingId(highlight.id);
    setActionError(null);

    try {
      await remove(highlight.book.id, highlight.id);
    } catch (cause) {
      setActionError(getApiErrorInfo(cause).message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <AppShell active="highlights">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca pessoal</p>
          <h1 className={styles.title}>Marcações</h1>
          <p className={styles.subtitle}>
            Os trechos que você destacou, por livro e por cor.
          </p>
        </div>

        {!isLoading && error === null && (
          <span className={styles.count}>
            {highlights.length}{" "}
            {highlights.length === 1 ? "marcação" : "marcações"}
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
            <option value="">Todos os livros ({highlights.length})</option>
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
            placeholder="Trecho, livro ou capítulo…"
            className={styles.input}
          />
        </label>
      </div>

      <div className={styles.colorFilters} role="group" aria-label="Filtrar por cor">
        <button
          type="button"
          className={resolveColorChipClass(selectedColor === "all")}
          onClick={() => setSelectedColor("all")}
          aria-pressed={selectedColor === "all"}
        >
          Todas as cores
        </button>

        {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={resolveColorChipClass(selectedColor === option.value)}
            data-color={option.value}
            onClick={() => setSelectedColor(option.value)}
            aria-pressed={selectedColor === option.value}
          >
            <span className={styles.colorDot} aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>

      {actionError !== null && <p className={styles.error}>{actionError}</p>}

      {isLoading && <p className={styles.status}>Carregando marcações…</p>}

      {!isLoading && error !== null && (
        <div className={styles.statusBox}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}

      {!isLoading && error === null && highlights.length === 0 && (
        <p className={styles.empty}>
          Nenhuma marcação ainda. Selecione um trecho no leitor e escolha uma
          cor.
        </p>
      )}

      {!isLoading &&
        error === null &&
        highlights.length > 0 &&
        filteredHighlights.length === 0 && (
          <p className={styles.empty}>
            Nenhuma marcação encontrada com esses filtros.
          </p>
        )}

      {filteredHighlights.length > 0 && (
        <ul className={styles.grid}>
          {filteredHighlights.map((highlight) => (
            <li key={highlight.id}>
              <article className={styles.card}>
                <span
                  className={styles.quote}
                  data-color={highlight.color}
                  title={highlight.quote}
                >
                  “{highlight.quote}”
                </span>
                <span className={styles.cardBook}>{highlight.book.title}</span>
                <span className={styles.cardMeta}>
                  {highlight.book.author ?? "Autor não informado"} · Capítulo{" "}
                  {highlight.chapterPosition} ·{" "}
                  {resolveHighlightColorLabel(highlight.color)} ·{" "}
                  {formatDate(highlight.createdAt)}
                </span>

                <div className={styles.cardActions}>
                  <Link
                    href={`/ebooks/${highlight.book.id}/ler?capitulo=${highlight.chapterPosition}&offset=${highlight.startOffset}`}
                    className={styles.openLink}
                  >
                    Abrir no livro
                  </Link>

                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => void handleRemove(highlight)}
                    disabled={removingId === highlight.id}
                  >
                    {removingId === highlight.id ? "Removendo…" : "Remover"}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function resolveColorChipClass(isActive: boolean): string {
  if (!isActive) return styles.colorChip;

  return `${styles.colorChip} ${styles.colorChipActive}`;
}
