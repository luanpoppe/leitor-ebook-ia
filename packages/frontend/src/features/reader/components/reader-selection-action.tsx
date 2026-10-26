"use client";

import type { CSSProperties, JSX } from "react";
import type { ReaderTextSelection } from "../use-text-selection";
import styles from "./reader-selection-action.module.css";

const ACTION_OFFSET_PX = 44;
const EDGE_PADDING_PX = 12;

interface ReaderSelectionActionProps {
  selection: ReaderTextSelection;
  onAsk(): void;
}

/**
 * Botão flutuante acima do texto selecionado. Não usa dialog: o clique não
 * pode roubar a seleção antes de ela virar pergunta.
 */
export function ReaderSelectionAction({
  selection,
  onAsk,
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
    <button
      type="button"
      className={styles.action}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAsk}
    >
      Perguntar à IA
    </button>
  );
}
