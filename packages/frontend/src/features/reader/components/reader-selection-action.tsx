"use client";

import type { CSSProperties, JSX } from "react";
import type { HighlightColor } from "@/features/highlights/api";
import { HighlightColorPicker } from "@/features/highlights/components/highlight-color-picker";
import type { ReaderTextSelection } from "../use-text-selection";
import styles from "./reader-selection-action.module.css";

const ACTION_OFFSET_PX = 56;
const EDGE_PADDING_PX = 12;

interface ReaderSelectionActionProps {
  selection: ReaderTextSelection;
  onAsk(): void;
  onHighlight(color: HighlightColor): void;
}

/**
 * Menu flutuante acima do texto selecionado, para mouse/teclado. Ele marca o
 * trecho em uma das quatro cores ou abre o chat com a seleção.
 *
 * No toque ele fica escondido (ver media query no CSS): o menu nativo do
 * navegador aparece em cima da seleção e cobriria o menu. Nesses aparelhos as
 * ações moram na barra superior (ReaderToolbar).
 */
export function ReaderSelectionAction({
  selection,
  onAsk,
  onHighlight,
}: ReaderSelectionActionProps): JSX.Element | null {
  const rect = selection.rect;
  if (rect === null) return null;

  const centerX = rect.left + rect.width / 2;
  const maxLeft = window.innerWidth - EDGE_PADDING_PX;
  const style = {
    top: Math.max(EDGE_PADDING_PX, rect.top - ACTION_OFFSET_PX),
    left: Math.min(Math.max(centerX, EDGE_PADDING_PX), maxLeft),
    transform: "translateX(-50%)",
  } as CSSProperties;

  return (
    <div
      data-reader-selection-action=""
      className={styles.menu}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      <HighlightColorPicker onSelect={onHighlight} />
      <span className={styles.separator} aria-hidden="true" />
      <button type="button" className={styles.ask} onClick={onAsk}>
        Perguntar à IA
      </button>
    </div>
  );
}
