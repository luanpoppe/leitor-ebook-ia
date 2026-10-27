"use client";

import { useEffect, useState } from "react";
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
 * Ação de perguntar sobre o trecho selecionado.
 *
 * Em telas de toque o menu nativo do navegador (copiar, compartilhar etc.)
 * aparece em cima da seleção e cobre um botão flutuante. Por isso, no toque a
 * ação vira uma barra fixa no rodapé, longe do menu nativo.
 */
export function ReaderSelectionAction({
  selection,
  onAsk,
}: ReaderSelectionActionProps): JSX.Element | null {
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    const updatePointerKind = () => setIsCoarsePointer(pointerQuery.matches);

    updatePointerKind();
    pointerQuery.addEventListener("change", updatePointerKind);

    return () => {
      pointerQuery.removeEventListener("change", updatePointerKind);
    };
  }, []);

  const rect = selection.rect;
  if (rect === null) return null;

  if (isCoarsePointer) {
    return (
      <div className={styles.bar}>
        <button
          type="button"
          data-reader-selection-action=""
          className={styles.barButton}
          onClick={onAsk}
        >
          Perguntar à IA
        </button>
      </div>
    );
  }

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
      data-reader-selection-action=""
      className={styles.action}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAsk}
    >
      Perguntar à IA
    </button>
  );
}
