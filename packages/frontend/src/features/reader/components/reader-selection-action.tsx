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
 * Botão flutuante acima do texto selecionado, para mouse/teclado.
 *
 * No toque ele fica escondido (ver media query no CSS): o menu nativo do
 * navegador aparece em cima da seleção e cobriria o botão. Nesses aparelhos a
 * ação mora na barra superior (ReaderToolbar), longe do menu nativo e da
 * sugestão de pesquisa do celular, que aparece embaixo.
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
