"use client";

import { useCallback, useImperativeHandle, useRef } from "react";
import type { CSSProperties, JSX, Ref } from "react";
import type { ReaderAlignment } from "../reader-preferences";
import styles from "./reader-measure-layer.module.css";

const PARAGRAPH_SEPARATOR = "\n\n";
// Repaginações repetidas reusam a altura do mesmo texto; ao passar do limite,
// o cache inteiro é descartado em vez de fazer LRU por entrada.
const MEASURE_CACHE_LIMIT = 300;

export interface ReaderMeasureLayerHandle {
  /** Altura em px que o texto ocupa na largura e tipografia da página. */
  measure(text: string): number;
}

interface ReaderMeasureLayerProps {
  fontSize: number;
  /** Largura útil do texto em px — a mesma da página de leitura. */
  width: number;
  /** Alinhamento do texto; entra na chave do cache de alturas. */
  alignment: ReaderAlignment;
  /**
   * Muda quando a tipografia real muda sem fonte/largura novas (ex.: a fonte
   * terminou de carregar); invalida o cache de alturas.
   */
  cacheEpoch?: number;
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
  alignment,
  cacheEpoch = 0,
  ref,
}: ReaderMeasureLayerProps): JSX.Element {
  const blockRef = useRef<HTMLDivElement | null>(null);
  // Altura medida só vale para a fonte e a largura em que foi lida; a chave
  // guarda a tipografia atual para descartar o cache quando ela mudar.
  const heightCacheRef = useRef(new Map<string, number>());
  const cacheKeyRef = useRef("");

  const measure = useCallback(
    (text: string): number => {
      // Antes do primeiro layout não há largura útil para medir.
      if (width <= 0) return 0;

      const cacheKey = `${fontSize}:${width}:${alignment}:${cacheEpoch}`;
      const isCacheStale = cacheKeyRef.current !== cacheKey;
      if (isCacheStale) {
        cacheKeyRef.current = cacheKey;
        heightCacheRef.current.clear();
      }

      const heightCache = heightCacheRef.current;
      const cachedHeight = heightCache.get(text);
      if (cachedHeight !== undefined) return cachedHeight;

      const block = blockRef.current;
      if (block === null) return 0;

      renderParagraphs(block, text);

      const blockRect = block.getBoundingClientRect();
      const height = blockRect.height;

      const isCacheOverLimit = heightCache.size >= MEASURE_CACHE_LIMIT;
      if (isCacheOverLimit) heightCache.clear();

      heightCache.set(text, height);

      return height;
    },
    [alignment, cacheEpoch, fontSize, width]
  );

  useImperativeHandle(ref, () => ({ measure }), [measure]);

  const blockStyle = {
    "--reader-font-size": `${fontSize}px`,
    width: `${width}px`,
  } as CSSProperties;

  return (
    <div className={styles.layer} aria-hidden="true">
      <div
        ref={blockRef}
        className={styles.block}
        style={blockStyle}
        data-alignment={alignment}
      />
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
