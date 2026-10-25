"use client";

import { useCallback, useEffect } from "react";
import type { PageTurnDirection } from "./use-reader-page";

const FORWARD_KEYS = ["ArrowRight", "PageDown"];
const BACKWARD_KEYS = ["ArrowLeft", "PageUp"];

interface UseReaderKeyboardOptions {
  isTocOpen: boolean;
  isReadingBlocked: boolean;
  onCloseToc: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

// O teclado virou página quando a leitura deixou de rolar (NT-4).
export function useReaderKeyboard({
  isTocOpen,
  isReadingBlocked,
  onCloseToc,
  onNext,
  onPrevious,
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

      const turnDirection = resolveTurnDirection(event);
      if (turnDirection === null) return;

      event.preventDefault();

      if (turnDirection === "next") {
        onNext();
        return;
      }

      onPrevious();
    },
    [isReadingBlocked, isTocOpen, onCloseToc, onNext, onPrevious]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

function resolveTurnDirection(
  event: KeyboardEvent
): PageTurnDirection | null {
  // Alt/Cmd/Ctrl pertencem ao navegador e ao sistema (Alt+← volta história).
  const hasModifier = event.altKey || event.metaKey || event.ctrlKey;
  if (hasModifier) return null;

  const isSpace = event.key === " " || event.key === "Space";
  if (isSpace) return event.shiftKey ? "previous" : "next";

  if (FORWARD_KEYS.includes(event.key)) return "next";
  if (BACKWARD_KEYS.includes(event.key)) return "previous";

  return null;
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
