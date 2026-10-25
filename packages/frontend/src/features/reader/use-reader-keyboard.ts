"use client";

import { useCallback, useEffect } from "react";
import type { ReaderMode } from "./reader-preferences";
import type { PageTurnDirection } from "./use-reader-page";

const FORWARD_KEYS = ["ArrowRight", "PageDown"];
const BACKWARD_KEYS = ["ArrowLeft", "PageUp"];
const SCROLL_PAGE_FRACTION = 0.9;
// Seta anda pouco: é navegação fina dentro do parágrafo, não virada de tela.
const SCROLL_LINE_FRACTION = 0.05;

interface ScrollStep {
  direction: -1 | 1;
  fraction: number;
}

const SCROLL_KEY_STEPS: ReadonlyMap<string, ScrollStep> = new Map([
  ["PageDown", { direction: 1, fraction: SCROLL_PAGE_FRACTION }],
  ["PageUp", { direction: -1, fraction: SCROLL_PAGE_FRACTION }],
  ["ArrowDown", { direction: 1, fraction: SCROLL_LINE_FRACTION }],
  ["ArrowUp", { direction: -1, fraction: SCROLL_LINE_FRACTION }],
]);

interface UseReaderKeyboardOptions {
  mode: ReaderMode;
  isTocOpen: boolean;
  isReadingBlocked: boolean;
  onCloseToc: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Rola uma tela na direção pedida; o modo página ignora. */
  onScrollPage(direction: -1 | 1, fraction?: number): void;
}

// Página vira; rolagem desce e sobe uma tela (NT-4 e NT-5).
export function useReaderKeyboard({
  mode,
  isTocOpen,
  isReadingBlocked,
  onCloseToc,
  onNext,
  onPrevious,
  onScrollPage,
}: UseReaderKeyboardOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isEditable = isEditableTarget(event.target);
      if (isEditable) return;

      if (event.key === "Escape") {
        if (!isTocOpen) return;
        onCloseToc();
        return;
      }

      // Sumário por cima ou trecho ainda carregando: a tecla não vira nada.
      const isReadingLocked = isTocOpen || isReadingBlocked;
      if (isReadingLocked) return;

      // Em botão/link, as setas e o Espaço pertencem ao próprio controle.
      const isActivationTarget = isButtonOrLinkTarget(event.target);
      if (isActivationTarget) return;

      if (mode === "scroll") {
        const scrollStep = resolveScrollStep(event);
        if (scrollStep === null) return;

        event.preventDefault();
        onScrollPage(scrollStep.direction, scrollStep.fraction);
        return;
      }

      const turnDirection = resolveTurnDirection(event);
      if (turnDirection === null) return;

      event.preventDefault();

      if (turnDirection === "next") {
        onNext();
        return;
      }

      onPrevious();
    },
    [
      isReadingBlocked,
      isTocOpen,
      mode,
      onCloseToc,
      onNext,
      onPrevious,
      onScrollPage,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

// Setas horizontais ficam de fora: na rolagem não há página a virar.
function resolveScrollStep(event: KeyboardEvent): ScrollStep | null {
  // Alt/Cmd/Ctrl pertencem ao navegador e ao sistema (Alt+← volta história).
  if (hasBlockingModifier(event)) return null;

  const isSpace = event.key === " " || event.key === "Space";
  if (isSpace) {
    const direction = event.shiftKey ? -1 : 1;
    return { direction, fraction: SCROLL_PAGE_FRACTION };
  }

  const step = SCROLL_KEY_STEPS.get(event.key);
  return step ?? null;
}

function resolveTurnDirection(
  event: KeyboardEvent
): PageTurnDirection | null {
  if (hasBlockingModifier(event)) return null;

  const isSpace = event.key === " " || event.key === "Space";
  if (isSpace) return event.shiftKey ? "previous" : "next";

  if (FORWARD_KEYS.includes(event.key)) return "next";
  if (BACKWARD_KEYS.includes(event.key)) return "previous";

  return null;
}

function hasBlockingModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.metaKey || event.ctrlKey;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  const isFormField =
    tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  const isEditable = isFormField || target.isContentEditable;
  return isEditable;
}

function isButtonOrLinkTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  return tagName === "BUTTON" || tagName === "A";
}
