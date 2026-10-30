"use client";

import { useMemo, useState } from "react";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { getApiErrorInfo } from "@/features/ebooks/api";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import type { BookHighlight, HighlightColor } from "@/features/highlights/api";
import {
  HIGHLIGHT_COLOR_OPTIONS,
  resolveHighlightColorLabel,
} from "@/features/highlights/highlight-colors";
import { HighlightColorPicker } from "./highlight-color-picker";
import styles from "./highlights.module.css";

type ColorFilter = HighlightColor | "all";

interface ReaderHighlightsDrawerProps {
  highlights: BookHighlight[];
  isLoading: boolean;
  error: string | null;
  onClose(): void;
  onReload(): void;
  onSelect(highlight: BookHighlight): void;
  onChangeColor(highlightId: string, color: HighlightColor): Promise<void>;
  onRemove(highlightId: string): Promise<void>;
}

/**
 * Marcações do livro dentro do leitor. Clicar em uma leva ao trecho e o botão
 * de retorno da tela devolve o leitor para onde ele estava.
 */
export function ReaderHighlightsDrawer({
  highlights,
  isLoading,
  error,
  onClose,
  onReload,
  onSelect,
  onChangeColor,
  onRemove,
}: ReaderHighlightsDrawerProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const [colorFilter, setColorFilter] = useState<ColorFilter>("all");
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [changingColorId, setChangingColorId] = useState<string | null>(null);

  const filteredHighlights = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

    return highlights.filter((highlight) => {
      const matchesColor =
        colorFilter === "all" || highlight.color === colorFilter;
      if (!matchesColor) return false;
      if (normalizedQuery.length === 0) return true;

      return highlight.quote
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    });
  }, [colorFilter, highlights, query]);

  const handleRemove = async (highlightId: string): Promise<void> => {
    setRemovingId(highlightId);
    setActionError(null);

    try {
      await onRemove(highlightId);
    } catch (cause) {
      setActionError(getApiErrorInfo(cause).message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleChangeColor = async (
    highlightId: string,
    color: HighlightColor
  ): Promise<void> => {
    setChangingColorId(highlightId);
    setActionError(null);

    try {
      await onChangeColor(highlightId, color);
    } catch (cause) {
      setActionError(getApiErrorInfo(cause).message);
    } finally {
      setChangingColorId(null);
    }
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
        aria-label="Marcações do livro"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Marcações</h2>
            <p className={styles.subtitle}>
              {highlights.length}{" "}
              {highlights.length === 1 ? "trecho marcado" : "trechos marcados"}
            </p>
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

        <div className={styles.content}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={styles.searchInput}
            placeholder="Buscar no texto marcado…"
            aria-label="Buscar nas marcações"
          />

          <div className={styles.colorFilters} role="group" aria-label="Filtrar por cor">
            <button
              type="button"
              className={resolveColorChipClass(colorFilter === "all")}
              onClick={() => setColorFilter("all")}
              aria-pressed={colorFilter === "all"}
            >
              Todas
            </button>

            {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={resolveColorChipClass(colorFilter === option.value)}
                data-color={option.value}
                onClick={() => setColorFilter(option.value)}
                aria-pressed={colorFilter === option.value}
              >
                <span className={styles.colorDot} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>

          {actionError !== null && (
            <p className={styles.error}>{actionError}</p>
          )}

          {isLoading && <p className={styles.status}>Carregando…</p>}

          {!isLoading && error !== null && (
            <div className={styles.statusBox}>
              <p className={styles.error}>{error}</p>
              <button type="button" className={styles.secondaryButton} onClick={onReload}>
                Tentar de novo
              </button>
            </div>
          )}

          {!isLoading && error === null && highlights.length === 0 && (
            <p className={styles.status}>
              Nenhuma marcação ainda. Selecione um trecho e escolha uma cor.
            </p>
          )}

          {!isLoading &&
            error === null &&
            highlights.length > 0 &&
            filteredHighlights.length === 0 && (
              <p className={styles.status}>
                Nenhuma marcação encontrada com esses filtros.
              </p>
            )}

          {filteredHighlights.length > 0 && (
            <ul className={styles.list}>
              {filteredHighlights.map((highlight) => (
                <li key={highlight.id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.jump}
                    onClick={() => onSelect(highlight)}
                  >
                    <span
                      className={styles.quote}
                      data-color={highlight.color}
                    >
                      “{highlight.quote}”
                    </span>
                    <span className={styles.meta}>
                      Capítulo {highlight.chapterPosition} ·{" "}
                      {resolveHighlightColorLabel(highlight.color)} ·{" "}
                      {formatDate(highlight.createdAt)}
                    </span>
                  </button>

                  <div className={styles.itemActions}>
                    <HighlightColorPicker
                      onSelect={(color) =>
                        void handleChangeColor(highlight.id, color)
                      }
                      disabled={changingColorId === highlight.id}
                      showLabel={false}
                      actionLabel="Mudar para"
                    />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => void handleRemove(highlight.id)}
                      disabled={removingId === highlight.id}
                      aria-label="Remover marcação"
                      title="Remover marcação"
                    >
                      {removingId === highlight.id ? "…" : "×"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function resolveColorChipClass(isActive: boolean): string {
  if (!isActive) return styles.colorChip;

  return `${styles.colorChip} ${styles.colorChipActive}`;
}
