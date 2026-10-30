"use client";

import Link from "next/link";
import type { CSSProperties, JSX } from "react";
import type { HighlightColor } from "@/features/highlights/api";
import { HighlightColorPicker } from "@/features/highlights/components/highlight-color-picker";
import type { ReaderAlignment, ReaderMode, ReaderTheme } from "../reader-preferences";
import styles from "./reader-toolbar.module.css";

interface ReaderToolbarProps {
  bookTitle: string;
  backHref: string;
  /** Rótulo do voltar; o leitor troca quando veio da página de conversas. */
  backLabel?: string;
  currentPosition: number | null;
  chaptersCount: number;
  pageLabel?: string | null;
  /** 0 a 1: posição no livro inteiro (capítulos anteriores + fração do atual). */
  bookProgress: number | null;
  chapterProgress: number;
  isTocOpen: boolean;
  onToggleToc: () => void;
  onOpenSearch: () => void;
  onOpenNotes: () => void;
  isHighlightsOpen: boolean;
  onOpenHighlights: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  fontSize: number;
  canDecreaseFont: boolean;
  canIncreaseFont: boolean;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  theme: ReaderTheme;
  onToggleTheme: () => void;
  alignment: ReaderAlignment;
  onToggleAlignment: () => void;
  mode: ReaderMode;
  onToggleMode: () => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  /** Seleção ativa: no toque as ações aparecem na barra, não sobre a seleção. */
  hasTextSelection: boolean;
  isMultiPagePending: boolean;
  onAskSelection: () => void;
  onHighlightSelection: (color: HighlightColor) => void;
  onStartMultiPage: () => void;
}

const BACK_LABEL = "Voltar para a ficha do livro";
const PREVIOUS_LABEL = "Capítulo anterior";
const NEXT_LABEL = "Próximo capítulo";
const TOC_LABEL = "Sumário";
const SEARCH_LABEL = "Buscar";
const CHAT_LABEL = "Chat";
const NOTES_LABEL = "Anotações";
const HIGHLIGHTS_LABEL = "Marcações";
const DECREASE_FONT_LABEL = "Diminuir fonte";
const INCREASE_FONT_LABEL = "Aumentar fonte";
const LIGHT_THEME_ACTION_LABEL = "Usar tema sépia";
const SEPIA_THEME_ACTION_LABEL = "Usar tema claro";
const JUSTIFY_ACTION_LABEL = "Justificar texto";
const LEFT_ALIGN_ACTION_LABEL = "Alinhar à esquerda";

function resolveProgress(chapterProgress: number): number {
  if (!Number.isFinite(chapterProgress)) return 0;

  const boundedProgress = Math.min(Math.max(chapterProgress, 0), 1);
  return Math.round(boundedProgress * 100);
}

function resolveChapterLabel(
  currentPosition: number | null,
  chaptersCount: number
): string {
  if (currentPosition === null) return "Carregando…";

  return `Capítulo ${currentPosition} de ${chaptersCount}`;
}

function resolveThemeActionLabel(theme: ReaderTheme): string {
  if (theme === "light") return LIGHT_THEME_ACTION_LABEL;

  return SEPIA_THEME_ACTION_LABEL;
}

/** Mostra o modo para onde o botão leva, não o modo atual. */
function resolveModeTargetLabel(mode: ReaderMode): string {
  if (mode === "page") return "Rolagem";

  return "Página";
}

function resolveModeActionLabel(mode: ReaderMode): string {
  const targetLabel = resolveModeTargetLabel(mode);

  return `Mudar para ${targetLabel.toLowerCase()}`;
}

function resolveIsTocButtonActive(isTocOpen: boolean): string {
  if (!isTocOpen) return styles.button;

  return `${styles.button} ${styles.buttonActive}`;
}

function resolveIsChatButtonActive(isChatOpen: boolean): string {
  if (!isChatOpen) return styles.button;

  return `${styles.button} ${styles.buttonActive}`;
}

function resolveIsHighlightsButtonActive(isOpen: boolean): string {
  if (!isOpen) return styles.button;

  return `${styles.button} ${styles.buttonActive}`;
}

export function ReaderToolbar({
  bookTitle,
  backHref,
  backLabel = BACK_LABEL,
  currentPosition,
  chaptersCount,
  pageLabel,
  bookProgress,
  chapterProgress,
  isTocOpen,
  onToggleToc,
  onOpenSearch,
  onOpenNotes,
  isHighlightsOpen,
  onOpenHighlights,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  fontSize,
  canDecreaseFont,
  canIncreaseFont,
  onDecreaseFont,
  onIncreaseFont,
  theme,
  onToggleTheme,
  alignment,
  onToggleAlignment,
  mode,
  onToggleMode,
  isChatOpen,
  onToggleChat,
  hasTextSelection,
  isMultiPagePending,
  onAskSelection,
  onHighlightSelection,
  onStartMultiPage,
}: ReaderToolbarProps): JSX.Element {
  const progressPercent = resolveProgress(chapterProgress);
  const bookPercent =
    bookProgress === null ? null : Math.round(bookProgress * 100);
  const chapterLabel = resolveChapterLabel(currentPosition, chaptersCount);
  const themeActionLabel = resolveThemeActionLabel(theme);
  const alignmentActionLabel =
    alignment === "justify" ? LEFT_ALIGN_ACTION_LABEL : JUSTIFY_ACTION_LABEL;
  const modeTargetLabel = resolveModeTargetLabel(mode);
  const modeActionLabel = resolveModeActionLabel(mode);
  const progressFillStyle = {
    "--reader-progress": `${progressPercent}%`,
  } as CSSProperties;

  return (
    <header className={styles.toolbar} data-theme={theme}>
      <div className={styles.identity}>
        <Link
          href={backHref}
          aria-label={backLabel}
          title={backLabel}
          className={styles.backButton}
        >
          ←
        </Link>

        <div className={styles.titleBlock}>
          <span className={styles.bookTitle} title={bookTitle}>
            {bookTitle}
          </span>
          <span
            className={styles.chapterLabel}
            role="status"
            aria-live="polite"
          >
            {chapterLabel}
          </span>
          {pageLabel || bookPercent !== null ? (
            <div className={styles.progressLabels}>
              {pageLabel ? (
                <span
                  className={styles.pageLabel}
                  title={pageLabel}
                  role="status"
                  aria-live="polite"
                >
                  {pageLabel}
                </span>
              ) : null}
              {pageLabel && bookPercent !== null ? (
                <span className={styles.labelSeparator} aria-hidden="true">
                  ·
                </span>
              ) : null}
              {bookPercent !== null ? (
                <span
                  className={styles.bookLabel}
                  title={`${bookPercent}% do livro`}
                  role="status"
                  aria-live="polite"
                >
                  {bookPercent}% do livro
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.progressZone}>
        <div
          role="progressbar"
          aria-label="Posição no capítulo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          className={styles.progressTrack}
        >
          <div className={styles.progressFill} style={progressFillStyle} />
        </div>
      </div>

      <div className={styles.controls}>
        {hasTextSelection && (
          <div className={styles.selectionTools} data-reader-selection-action="">
            <HighlightColorPicker
              onSelect={onHighlightSelection}
              label={isMultiPagePending ? "Concluir" : "Marcar"}
              actionLabel={isMultiPagePending ? "Concluir em" : "Marcar em"}
            />
            {!isMultiPagePending && (
              <button
                type="button"
                onClick={onStartMultiPage}
                className={styles.multiPageButton}
              >
                Várias páginas
              </button>
            )}
            <button
              type="button"
              onClick={onAskSelection}
              className={styles.selectionButton}
            >
              Perguntar à IA
            </button>
          </div>
        )}

        <div className={styles.controlGroup}>
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label={PREVIOUS_LABEL}
            title={PREVIOUS_LABEL}
            className={styles.button}
          >
            ←
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={NEXT_LABEL}
            title={NEXT_LABEL}
            className={styles.button}
          >
            →
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleToc}
          aria-expanded={isTocOpen}
          aria-label={TOC_LABEL}
          className={resolveIsTocButtonActive(isTocOpen)}
        >
          {TOC_LABEL}
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label={SEARCH_LABEL}
          className={styles.button}
        >
          {SEARCH_LABEL}
        </button>

        <button
          type="button"
          onClick={onToggleChat}
          aria-expanded={isChatOpen}
          aria-label={CHAT_LABEL}
          className={resolveIsChatButtonActive(isChatOpen)}
        >
          {CHAT_LABEL}
        </button>

        <button
          type="button"
          onClick={onOpenNotes}
          aria-label={NOTES_LABEL}
          className={styles.button}
        >
          {NOTES_LABEL}
        </button>

        <button
          type="button"
          onClick={onOpenHighlights}
          aria-expanded={isHighlightsOpen}
          aria-label={HIGHLIGHTS_LABEL}
          className={resolveIsHighlightsButtonActive(isHighlightsOpen)}
        >
          {HIGHLIGHTS_LABEL}
        </button>

        <div className={styles.controlGroup}>
          <button
            type="button"
            onClick={onDecreaseFont}
            disabled={!canDecreaseFont}
            aria-label={DECREASE_FONT_LABEL}
            title={DECREASE_FONT_LABEL}
            className={styles.button}
          >
            A−
          </button>
          <span className={styles.fontSizeValue} title="Tamanho da fonte">
            {fontSize}px
          </span>
          <button
            type="button"
            onClick={onIncreaseFont}
            disabled={!canIncreaseFont}
            aria-label={INCREASE_FONT_LABEL}
            title={INCREASE_FONT_LABEL}
            className={styles.button}
          >
            A+
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={themeActionLabel}
          title={themeActionLabel}
          className={styles.themeButton}
        >
          {themeActionLabel}
        </button>

        <button
          type="button"
          onClick={onToggleAlignment}
          aria-label={alignmentActionLabel}
          aria-pressed={alignment === "justify"}
          title={alignmentActionLabel}
          className={styles.themeButton}
        >
          {(alignment === "justify" ? "Esquerda" : "Justificar")}
        </button>

        <button
          type="button"
          onClick={onToggleMode}
          aria-label={modeActionLabel}
          title={modeActionLabel}
          className={styles.themeButton}
        >
          {modeTargetLabel}
        </button>
      </div>
    </header>
  );
}
