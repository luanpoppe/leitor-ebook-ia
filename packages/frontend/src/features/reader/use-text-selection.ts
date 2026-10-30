"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { PagePaginator } from "./window/page-paginator";

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
  /** Capítulo e offsets do trecho; null se a seleção atravessa capítulos. */
  chapterPosition: number | null;
  startOffset: number | null;
  endOffset: number | null;
}

interface BoundaryOffset {
  chapterPosition: number;
  offset: number;
}

const MIN_SELECTION_LENGTH = 2;
// Teto do trecho que vai para o prompt; o backend também limita.
const MAX_SELECTION_LENGTH = 4_000;
const MAX_BEFORE_LENGTH = 800;
const SELECTION_ACTION_SELECTOR = "[data-reader-selection-action]";
// No toque, tocar na barra pode colapsar a seleção antes do clique chegar no
// botão de cor. O estado sobrevive por um instante para a ação usar os offsets
// já capturados; se for um toque fora, o menu some logo depois.
const COLLAPSED_CLEAR_DELAY_MS = 400;

/**
 * Seleção de texto dentro da área de leitura. A ação aparece no pointerup (e
 * no teclado, com Shift+setas), depois que o navegador terminou de selecionar.
 */
export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
): ReaderTextSelection | null {
  const [selection, setSelection] = useState<ReaderTextSelection | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const rawText = browserSelection.toString();
    const text = rawText.trim();
    if (!isInside || text.length < MIN_SELECTION_LENGTH) {
      setSelection(null);
      return;
    }

    const startBoundary = readBoundaryOffset(
      container,
      range.startContainer,
      range.startOffset
    );
    const endBoundary = readBoundaryOffset(
      container,
      range.endContainer,
      range.endOffset
    );
    const offsets = resolveSelectionOffsets(rawText, startBoundary, endBoundary);
    const rect = range.getBoundingClientRect();
    const before = readTextBefore(container, range);
    setSelection({
      text: Array.from(text).slice(0, MAX_SELECTION_LENGTH).join(""),
      before,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      ...offsets,
    });
  }, [containerRef]);

  /**
   * Tocar no próprio botão de ação não pode ser lido como "sumiu a seleção":
   * o navegador pode colapsar a seleção no toque e o botão desapareceria antes
   * do clique virar pergunta.
   */
  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const target = event.target;
      const isActionTap =
        target instanceof Element &&
        target.closest(SELECTION_ACTION_SELECTOR) !== null;
      if (isActionTap) return;

      readSelection();
    },
    [readSelection]
  );

  const cancelClearTimer = useCallback(() => {
    if (clearTimerRef.current === null) return;

    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = null;
  }, []);

  // Limpar a seleção (ao criar a marcação, por exemplo) precisa esconder o menu
  // sem esperar o próximo pointerup. O pequeno atraso cobre o toque na barra:
  // o navegador colapsa a seleção antes do clique, mas a ação ainda precisa dos
  // offsets capturados.
  const handleSelectionChange = useCallback(() => {
    const isCollapsed = window.getSelection()?.isCollapsed !== false;
    if (!isCollapsed) {
      cancelClearTimer();
      return;
    }

    if (clearTimerRef.current !== null) return;

    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      if (window.getSelection()?.isCollapsed !== false) setSelection(null);
    }, COLLAPSED_CLEAR_DELAY_MS);
  }, [cancelClearTimer]);

  useEffect(() => {
    if (!enabled) {
      cancelClearTimer();
      setSelection(null);
      return;
    }

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("keyup", readSelection);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      cancelClearTimer();
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keyup", readSelection);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [
    cancelClearTimer,
    enabled,
    handlePointerUp,
    handleSelectionChange,
    readSelection,
  ]);

  return selection;
}

function resolveSelectionOffsets(
  rawText: string,
  start: BoundaryOffset | null,
  end: BoundaryOffset | null
): Pick<ReaderTextSelection, "chapterPosition" | "startOffset" | "endOffset"> {
  const withoutOffsets = {
    chapterPosition: null,
    startOffset: null,
    endOffset: null,
  };

  if (start === null || end === null) return withoutOffsets;
  if (start.chapterPosition !== end.chapterPosition) return withoutOffsets;

  const leadingLength = rawText.length - rawText.trimStart().length;
  const trailingLength = rawText.length - rawText.trimEnd().length;
  const leadingCodePoints = PagePaginator.countCodePoints(
    rawText,
    0,
    leadingLength
  );
  const trailingCodePoints = PagePaginator.countCodePoints(
    rawText,
    rawText.length - trailingLength,
    rawText.length
  );
  const startOffset = start.offset + leadingCodePoints;
  const endOffset = Math.min(
    end.offset - trailingCodePoints,
    startOffset + MAX_SELECTION_LENGTH
  );

  if (endOffset <= startOffset) return withoutOffsets;

  return {
    chapterPosition: start.chapterPosition,
    startOffset,
    endOffset,
  };
}

/**
 * Offset absoluto de uma extremidade da seleção. O parágrafo tem o offset do
 * começo no DOM; a distância até a extremidade é contada em code points para
 * casar com os offsets que o backend usa no capítulo.
 */
function readBoundaryOffset(
  container: HTMLElement,
  node: Node,
  nodeOffset: number
): BoundaryOffset | null {
  const paragraph = findAttributeOwner(node, "data-offset");
  if (paragraph === null || !container.contains(paragraph)) return null;

  const positionElement = findAttributeOwner(paragraph, "data-position");
  const rawOffset = paragraph.getAttribute("data-offset");
  const rawPosition = positionElement?.getAttribute("data-position") ?? null;
  if (rawOffset === null || rawPosition === null) return null;

  const localRange = document.createRange();
  try {
    localRange.setStart(paragraph, 0);
    const isParagraphBoundary = node === paragraph;
    const localEndOffset = isParagraphBoundary
      ? Math.min(nodeOffset, paragraph.childNodes.length)
      : nodeOffset;
    localRange.setEnd(node, localEndOffset);
  } catch {
    return null;
  }

  const localText = localRange.toString();
  const localCodePoints = PagePaginator.countCodePoints(
    localText,
    0,
    localText.length
  );

  return {
    chapterPosition: Number(rawPosition),
    offset: Number(rawOffset) + localCodePoints,
  };
}

function findAttributeOwner(
  node: Node,
  attribute: string
): HTMLElement | null {
  const element =
    node instanceof Element ? node : node.parentElement ?? null;

  return element?.closest<HTMLElement>(`[${attribute}]`) ?? null;
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
