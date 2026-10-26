"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

export interface ReaderSelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ReaderTextSelection {
  text: string;
  /** Texto imediatamente anterior à seleção, para dar contexto à IA. */
  before: string;
  rect: ReaderSelectionRect | null;
}

const MIN_SELECTION_LENGTH = 2;
// Teto do trecho que vai para o prompt; o backend também limita.
const MAX_SELECTION_LENGTH = 4_000;
const MAX_BEFORE_LENGTH = 800;

/**
 * Seleção de texto dentro da área de leitura. A ação aparece no pointerup (e
 * no teclado, com Shift+setas), depois que o navegador terminou de selecionar.
 */
export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
): ReaderTextSelection | null {
  const [selection, setSelection] = useState<ReaderTextSelection | null>(null);

  const readSelection = useCallback(() => {
    const container = containerRef.current;
    if (container === null) {
      setSelection(null);
      return;
    }

    const browserSelection = window.getSelection();
    if (browserSelection === null) {
      setSelection(null);
      return;
    }

    const isEmpty =
      browserSelection.isCollapsed || browserSelection.rangeCount === 0;
    if (isEmpty) {
      setSelection(null);
      return;
    }

    const range = browserSelection.getRangeAt(0);
    const isInside =
      container.contains(range.startContainer) &&
      container.contains(range.endContainer);
    const text = browserSelection.toString().trim();
    if (!isInside || text.length < MIN_SELECTION_LENGTH) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const before = readTextBefore(container, range);
    setSelection({
      text: text.slice(0, MAX_SELECTION_LENGTH),
      before,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }, [containerRef]);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }

    document.addEventListener("pointerup", readSelection);
    document.addEventListener("keyup", readSelection);

    return () => {
      document.removeEventListener("pointerup", readSelection);
      document.removeEventListener("keyup", readSelection);
    };
  }, [enabled, readSelection]);

  return selection;
}

/** Texto entre o começo da área de leitura e o início da seleção. */
function readTextBefore(container: HTMLElement, range: Range): string {
  try {
    const beforeRange = range.cloneRange();
    beforeRange.setStart(container, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    return beforeRange.toString().slice(-MAX_BEFORE_LENGTH).trim();
  } catch {
    return "";
  }
}
