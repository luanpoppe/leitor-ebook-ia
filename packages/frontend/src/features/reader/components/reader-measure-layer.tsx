"use client";

import { useCallback, useImperativeHandle, useRef } from "react";
import type { CSSProperties, JSX, Ref } from "react";
import styles from "./reader-measure-layer.module.css";

const PARAGRAPH_SEPARATOR = "\n\n";

export interface ReaderMeasureLayerHandle {
  /** Altura em px que o texto ocupa na largura e tipografia da página. */
  measure(text: string): number;
}

interface ReaderMeasureLayerProps {
  fontSize: number;
  /** Largura útil do texto em px — a mesma da página de leitura. */
  width: number;
  ref?: Ref<ReaderMeasureLayerHandle>;
}

/**
 * Texto invisível com a tipografia real da página, usado só para medir. Fica
 * fora do fluxo e escondido de leitores de tela; a altura é lida do layout,
 * então fonte, largura e espaçamento entre parágrafos batem com o que o leitor
 * vai ver.
 */
export function ReaderMeasureLayer({
  fontSize,
  width,
  ref,
}: ReaderMeasureLayerProps): JSX.Element {
  const blockRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback((text: string): number => {
    const block = blockRef.current;
    if (block === null) return 0;

    renderParagraphs(block, text);

    const blockRect = block.getBoundingClientRect();
    return blockRect.height;
  }, []);

  useImperativeHandle(ref, () => ({ measure }), [measure]);

  const blockStyle = {
    "--reader-font-size": `${fontSize}px`,
    width: `${width}px`,
  } as CSSProperties;

  return (
    <div className={styles.layer} aria-hidden="true">
      <div ref={blockRef} className={styles.block} style={blockStyle} />
    </div>
  );
}

// Mesma divisão da renderização da página: parágrafo vazio não gera elemento,
// e o texto parcial de uma página medida à força também vira parágrafo.
function renderParagraphs(block: HTMLElement, text: string): void {
  block.replaceChildren();

  const rawParagraphs = text.split(PARAGRAPH_SEPARATOR);
  for (const paragraph of rawParagraphs) {
    const isEmpty = paragraph.length === 0;
    if (isEmpty) continue;

    const element = document.createElement("p");
    element.className = styles.paragraph;
    element.textContent = paragraph;
    block.append(element);
  }
}
