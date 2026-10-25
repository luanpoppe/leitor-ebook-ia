"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Diálogo de detalhe: foco preso, Esc fecha e o scroll do fundo trava.
export function useDialogPanel(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      const elementToRestore =
        previouslyFocusedElement instanceof HTMLElement
          ? previouslyFocusedElement
          : null;
      if (elementToRestore?.isConnected) elementToRestore.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );

    const hasFocusableElements = focusableElements.length > 0;
    if (!hasFocusableElements) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const isLeavingFromLast =
      !event.shiftKey && document.activeElement === lastElement;
    const isLeavingFromFirst =
      event.shiftKey && document.activeElement === firstElement;

    if (isLeavingFromLast) {
      event.preventDefault();
      firstElement.focus();
      return;
    }

    if (isLeavingFromFirst) {
      event.preventDefault();
      lastElement.focus();
    }
  };

  return { dialogRef, closeButtonRef, handleKeyDown };
}
