"use client";

import { useCallback, useEffect } from "react";

const SCROLL_PAGE_RATIO = 0.9;
const CHAPTER_TEXT_SELECTOR = '[aria-label="Texto do capítulo"]';

interface UseReaderKeyboardOptions {
  isTocOpen: boolean;
  isReadingBlocked: boolean;
  onCloseToc: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

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

      if (isReadingBlocked) return;

      const isArrowRight = event.key === "ArrowRight";
      if (isArrowRight && !isTocOpen) {
        event.preventDefault();
        onNext();
        return;
      }

      const isArrowLeft = event.key === "ArrowLeft";
      if (isArrowLeft && !isTocOpen) {
        event.preventDefault();
        onPrevious();
        return;
      }

      const isSpace = event.key === " " || event.key === "Space";
      const isPageDown = event.key === "PageDown";
      const isPageUp = event.key === "PageUp";
      const isPageScrollKey = isPageDown || isPageUp || isSpace;
      if (!isPageScrollKey) return;

      // Com o sumário aberto, rolar o capítulo por trás do drawer confunde.
      if (isTocOpen) return;

      // Em botão/link, a ativação nativa (Espaço/Enter) deve acontecer.
      const isActivationTarget = isButtonOrLinkTarget(event.target);
      if (isActivationTarget) return;

      scrollChapterByPage(isPageUp, event);
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

function scrollChapterByPage(
  isPageUp: boolean,
  event: KeyboardEvent
): void {
  const viewport = document.querySelector<HTMLElement>(CHAPTER_TEXT_SELECTOR);
  if (viewport === null) return;

  // Com o container já focado, o navegador rola sozinho; rolar aqui duplicaria.
  const isViewportFocused = document.activeElement === viewport;
  if (isViewportFocused) return;

  event.preventDefault();

  const direction = isPageUp ? -1 : 1;
  const distance = viewport.clientHeight * SCROLL_PAGE_RATIO;
  viewport.scrollBy({
    top: direction * distance,
    behavior: "smooth",
  });
}
