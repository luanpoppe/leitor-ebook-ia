"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import type { ReaderTheme } from "../reader-preferences";
import type { ReaderAlignment } from "../reader-preferences";
import { ReaderHeading } from "../heading";
import type { ReaderPageMetrics } from "../use-reader-page";
import type { TextPage } from "../window/page-paginator";
import {
  ReaderMeasureLayer,
  type ReaderMeasureLayerHandle,
} from "./reader-measure-layer";
import styles from "./reader-page-view.module.css";

const PARAGRAPH_SEPARATOR = "\n\n";
const EMPTY_SIZE = { pageHeight: 0, width: 0 };

export interface ReaderPageViewProps {
  page: TextPage | null;
  /** Muda a cada página (ex.: `${position}:${pageIndex}`) para animar a entrada. */
  pageKey: string;
  direction: "next" | "previous" | null;
  /** Eixo da animação de entrada: página horizontal, rolagem vertical. */
  turnAxis?: "horizontal" | "vertical";
  fontSize: number;
  theme: ReaderTheme;
  alignment: ReaderAlignment;
  /** Régua + altura útil; chamado quando a área é medida ou redimensionada. */
  onMetricsChange(metrics: ReaderPageMetrics): void;
}

interface ContentSize {
  pageHeight: number;
  width: number;
}

export function ReaderPageView({
  page,
  pageKey,
  direction,
  turnAxis = "horizontal",
  fontSize,
  theme,
  alignment,
  onMetricsChange,
}: ReaderPageViewProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const measureLayerRef = useRef<ReaderMeasureLayerHandle | null>(null);
  const [size, setSize] = useState<ContentSize>(EMPTY_SIZE);
  const [measureEpoch, setMeasureEpoch] = useState(0);

  useEffect(() => {
    const content = contentRef.current;
    if (content === null) return;

    const updateSize = (): void => {
      const nextSize = readContentSize(content);
      setSize((currentSize) =>
        isSameSize(currentSize, nextSize) ? currentSize : nextSize
      );
    };

    // Primeira medida antes de observar: o observer só avisa mudanças.
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  // A fonte pode terminar de carregar depois da primeira medição; sem repaginar
  // com a fonte real, as linhas quebram em lugar diferente do que foi medido.
  useEffect(() => {
    const fontSet = document.fonts;
    if (fontSet === undefined) return;

    let isMounted = true;
    const bumpMeasureEpoch = (): void => {
      if (!isMounted) return;
      setMeasureEpoch((epoch) => epoch + 1);
    };

    void fontSet.ready.then(bumpMeasureEpoch);
    fontSet.addEventListener("loadingdone", bumpMeasureEpoch);

    return () => {
      isMounted = false;
      fontSet.removeEventListener("loadingdone", bumpMeasureEpoch);
    };
  }, []);

  const { pageHeight, width } = size;

  const measure = useCallback(
    (text: string): number => {
      // Sem largura útil a régua não tem onde medir; 0 mantém o motor em
      // "medição ainda não pronta" em vez de paginar com altura falsa.
      if (width <= 0) return 0;

      const handle = measureLayerRef.current;
      if (handle === null) return 0;

      return handle.measure(text);
    },
    // `fontSize` e `measureEpoch` entram na identidade de propósito: a régua
    // muda com a fonte e o motor só repagina quando a função muda. A largura da
    // coluna nem sempre acompanha a fonte (coluna limitada pela tela, não 68ch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alignment, fontSize, measureEpoch, width]
  );

  useEffect(() => {
    // Altura 0 ainda é "não medido": publicar isso só faria a tela esperar de novo.
    if (pageHeight <= 0) return;

    onMetricsChange({ pageHeight, measure });
  }, [measure, onMetricsChange, pageHeight]);

  const paragraphs = splitParagraphs(page?.text ?? "");
  const containerStyle = {
    "--reader-font-size": `${fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={styles.frame}
      data-theme={theme}
      data-alignment={alignment}
      style={containerStyle}
    >
      <div
        ref={contentRef}
        className={styles.content}
        role="region"
        aria-label="Texto da página"
        tabIndex={0}
      >
        {/* Só os parágrafos remontam: a régua e a área medida ficam estáveis. */}
        <div
          key={pageKey}
          className={styles.page}
          data-direction={direction ?? "none"}
          data-axis={turnAxis}
        >
          {paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className={
                ReaderHeading.isHeading(paragraph)
                  ? styles.heading
                  : styles.paragraph
              }
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <ReaderMeasureLayer
        ref={measureLayerRef}
        fontSize={fontSize}
        width={width}
        alignment={alignment}
        cacheEpoch={measureEpoch}
      />
    </div>
  );
}

// Mesma regra da camada de medição: parágrafo vazio não vira elemento.
function splitParagraphs(text: string): string[] {
  const rawParagraphs = text.split(PARAGRAPH_SEPARATOR);
  const paragraphs: string[] = [];

  for (const paragraph of rawParagraphs) {
    const isEmpty = paragraph.length === 0;
    if (isEmpty) continue;

    paragraphs.push(paragraph);
  }

  return paragraphs;
}

// `clientWidth`/`clientHeight` incluem o padding; o texto só ocupa o miolo.
function readContentSize(content: HTMLElement): ContentSize {
  const computedStyle = getComputedStyle(content);
  const paddingTop = parsePadding(computedStyle.paddingTop);
  const paddingBottom = parsePadding(computedStyle.paddingBottom);
  const paddingLeft = parsePadding(computedStyle.paddingLeft);
  const paddingRight = parsePadding(computedStyle.paddingRight);

  const pageHeight = content.clientHeight - paddingTop - paddingBottom;
  const width = content.clientWidth - paddingLeft - paddingRight;

  return {
    pageHeight: Math.max(0, pageHeight),
    width: Math.max(0, width),
  };
}

function parsePadding(rawValue: string): number {
  const parsedValue = Number.parseFloat(rawValue);
  if (Number.isNaN(parsedValue)) return 0;

  return parsedValue;
}

function isSameSize(currentSize: ContentSize, nextSize: ContentSize): boolean {
  const isSameHeight = currentSize.pageHeight === nextSize.pageHeight;
  const isSameWidth = currentSize.width === nextSize.width;

  return isSameHeight && isSameWidth;
}
