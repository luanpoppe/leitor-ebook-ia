"use client";

import { useEffect } from "react";
import type { CSSProperties, JSX } from "react";
import type { BookHighlight } from "../api";
import styles from "./highlight-action-popover.module.css";

const POPOVER_WIDTH = 210;
const POPOVER_HEIGHT = 44;
const EDGE_PADDING = 10;

interface HighlightActionPopoverProps {
  highlight: BookHighlight;
  anchor: DOMRect;
  onRemove(): void;
  onClose(): void;
}

/** Ações rápidas ao tocar em um trecho já marcado. */
export function HighlightActionPopover({
  highlight,
  anchor,
  onRemove,
  onClose,
}: HighlightActionPopoverProps): JSX.Element {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      const isInside =
        target instanceof Element &&
        target.closest("[data-highlight-action]") !== null;
      if (!isInside) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const centerX = anchor.left + anchor.width / 2;
  const maxLeft = window.innerWidth - POPOVER_WIDTH / 2 - EDGE_PADDING;
  const left = Math.min(Math.max(centerX, POPOVER_WIDTH / 2 + EDGE_PADDING), maxLeft);
  const fitsAbove = anchor.top >= POPOVER_HEIGHT + EDGE_PADDING + 4;
  const top = fitsAbove
    ? anchor.top - POPOVER_HEIGHT - 4
    : anchor.bottom + 6;
  const style = {
    top,
    left,
    transform: "translateX(-50%)",
  } as CSSProperties;

  return (
    <div
      className={styles.popover}
      style={style}
      data-highlight-action=""
      role="dialog"
      aria-label="Marcação de texto"
    >
      <span
        className={styles.swatch}
        data-color={highlight.color}
        aria-hidden="true"
      />
      <button type="button" className={styles.remove} onClick={onRemove}>
        Remover marcação
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
