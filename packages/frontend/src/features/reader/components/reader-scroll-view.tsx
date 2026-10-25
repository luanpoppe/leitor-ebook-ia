"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, JSX } from "react";
import type { ReaderTheme } from "../reader-preferences";
import type { ScrollSegment } from "../use-reader-scroll";
import styles from "./reader-scroll-view.module.css";

const SEGMENT_KEY_ATTRIBUTE = "data-segment-key";
const SEGMENT_ROOT_MARGIN = "150% 0px";
const LOAD_MORE_SCREENS = 1.5;
const LOAD_PREVIOUS_SCREENS = 1;
const EMPTY_SPACERS: ReadonlyMap<string, number> = new Map();

interface ScrollPoint {
  position: number;
  offset: number;
}

export interface ReaderScrollViewHandle {
  /** Rola até o parágrafo do offset pedido, se ele estiver carregado. */
  scrollToOffset(position: number, offset: number): void;
}

export interface ReaderScrollViewProps {
  segments: ScrollSegment[];
  isLoading: boolean;
  error: Error | null;
  hasReachedEnd: boolean;
  fontSize: number;
  theme: ReaderTheme;
  /** Quando muda (troca de modo ou de capítulo pelo sumário), a view rola até ali. */
  anchor: { position: number; offset: number } | null;
  onLoadMore(): void;
  onLoadPrevious(): void;
  onRetry(): void;
  /** Topo visível mudou. */
  onVisibleChange(position: number, offset: number): void;
}

export const ReaderScrollView = forwardRef<
  ReaderScrollViewHandle,
  ReaderScrollViewProps
>(function ReaderScrollView(props, ref): JSX.Element {
  const {
    segments, isLoading, error, hasReachedEnd, fontSize, theme, anchor,
    onLoadMore, onLoadPrevious, onRetry, onVisibleChange,
  } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  // Altura de cada trecho que saiu do DOM. O espaçador ocupa o mesmo espaço,
  // então a barra de rolagem e a posição não pulam ao descartar conteúdo.
  const [spacers, setSpacers] = useState(EMPTY_SPACERS);

  const lastFirstKeyRef = useRef<string | null>(null);
  const lastSecondKeyRef = useRef<string | null>(null);
  const lastScrollHeightRef = useRef(0);
  const appliedAnchorRef = useRef<ReaderScrollViewProps["anchor"]>(null);
  const restorePointRef = useRef<ScrollPoint | null>(null);
  const visibleKeyRef = useRef<string | null>(null);
  const visiblePointRef = useRef<ScrollPoint | null>(null);

  const scrollToOffset = useCallback((position: number, offset: number): boolean => {
    const viewport = viewportRef.current;
    if (viewport === null) return false;

    const paragraph = findParagraph(viewport, position, offset);
    if (paragraph === null) return false;

    const viewportRect = viewport.getBoundingClientRect();
    const paragraphRect = paragraph.getBoundingClientRect();
    viewport.scrollTop += paragraphRect.top - viewportRect.top;
    return true;
  }, []);
  // Assinatura só muda quando o conjunto de trechos muda: gatilho para
  // recriar o observer, não para cada parágrafo novo no mesmo trecho.
  const segmentsSignature = segments.map((segment) => segment.key).join("|");
  const containerStyle = { "--reader-font-size": `${fontSize}px` } as CSSProperties;

  useLayoutEffect(() => {
    // Altura medida vale só para a tipografia atual; com fonte nova, tudo é
    // remedido e o parágrafo do topo é reencontrado pelo offset.
    setSpacers(EMPTY_SPACERS);
    restorePointRef.current = visiblePointRef.current;
  }, [fontSize]);

  useLayoutEffect(() => {
    const restorePoint = restorePointRef.current;
    if (restorePoint === null || spacers.size > 0) return;

    restorePointRef.current = null;
    scrollToOffset(restorePoint.position, restorePoint.offset);
  }, [fontSize, scrollToOffset, spacers]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const firstKey = segments[0]?.key ?? null;
    const previousFirstKey = lastFirstKeyRef.current;
    const previousSecondKey = lastSecondKeyRef.current;
    const keys = new Set(segments.map((segment) => segment.key));
    const isFirstChanged =
      previousFirstKey !== null && firstKey !== previousFirstKey;
    // Prepender ou descartar o começo (o motor mantém 5 trechos) muda a altura
    // acima do topo; a diferença volta ao scrollTop para o texto na tela não
    // saltar. Troca de capítulo zera a lista e não entra aqui.
    const isContentKeptAbove =
      (previousFirstKey !== null && keys.has(previousFirstKey)) ||
      (previousSecondKey !== null && keys.has(previousSecondKey));
    if (isFirstChanged && isContentKeptAbove) {
      viewport.scrollTop += viewport.scrollHeight - lastScrollHeightRef.current;
    }

    lastFirstKeyRef.current = firstKey;
    lastSecondKeyRef.current = segments[1]?.key ?? null;
    lastScrollHeightRef.current = viewport.scrollHeight;
  }, [segments, spacers]);

  useLayoutEffect(() => {
    if (anchor === null || anchor === appliedAnchorRef.current) return;

    // Offset ainda não carregado: a âncora fica pendente e este efeito tenta
    // de novo quando o motor anexar o trecho que a contém.
    const didScroll = scrollToOffset(anchor.position, anchor.offset);
    if (didScroll) appliedAnchorRef.current = anchor;
  }, [anchor, scrollToOffset, segments]);

  useImperativeHandle(ref, () => ({
    scrollToOffset(position: number, offset: number): void {
      scrollToOffset(position, offset);
    },
  }), [scrollToOffset]);

  const evaluateScroll = useCallback((): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const point = findTopPoint(viewport);
    const pointKey = point === null ? null : `${point.position}:${point.offset}`;
    if (point !== null && pointKey !== visibleKeyRef.current) {
      visibleKeyRef.current = pointKey;
      visiblePointRef.current = point;
      onVisibleChange(point.position, point.offset);
    }

    // Falha ou fim do livro param as cargas: o aviso muda a altura do conteúdo
    // e, sem isso, dispararia a mesma busca em loop.
    if (isLoading || hasReachedEnd || error !== null) return;

    const distanceToEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceToEnd < viewport.clientHeight * LOAD_MORE_SCREENS) {
      onLoadMore();
      return;
    }

    const isNearStart = viewport.scrollTop < viewport.clientHeight * LOAD_PREVIOUS_SCREENS;
    if (isNearStart) onLoadPrevious();
  }, [error, hasReachedEnd, isLoading, onLoadMore, onLoadPrevious, onVisibleChange]);

  const scheduleEvaluation = useCallback((): void => {
    const pendingFrame = frameRef.current;
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      evaluateScroll();
    });
  }, [evaluateScroll]);

  const handleIntersections = useCallback(
    (entries: IntersectionObserverEntry[]): void => {
      const measurements = new Map<string, number>();
      const expansions: string[] = [];

      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const key = element.getAttribute(SEGMENT_KEY_ATTRIBUTE);
        if (key === null) continue;

        // Espaçador não tem posição: é ele quem pede para voltar a montar.
        const isSpacer = element.getAttribute("data-position") === null;
        const height = element.offsetHeight;
        if (entry.isIntersecting) {
          if (isSpacer) expansions.push(key);
          continue;
        }
        if (!isSpacer && height > 0) measurements.set(key, height);
      }

      if (measurements.size === 0 && expansions.length === 0) return;
      setSpacers((currentSpacers) => {
        const nextSpacers = new Map(currentSpacers);
        for (const [key, height] of measurements) nextSpacers.set(key, height);
        for (const key of expansions) nextSpacers.delete(key);
        return nextSpacers;
      });
    },
    []
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (viewport === null || content === null) return;

    const intersectionObserver = new IntersectionObserver(handleIntersections, {
      root: viewport,
      rootMargin: SEGMENT_ROOT_MARGIN,
    });
    const blocks = viewport.querySelectorAll(`[${SEGMENT_KEY_ATTRIBUTE}]`);
    for (const block of Array.from(blocks)) intersectionObserver.observe(block);

    // Conteúdo menor que a tela não gera scroll; o observer cobre esse caso e
    // também reavalia depois de anexar ou prepender.
    const resizeObserver = new ResizeObserver(scheduleEvaluation);
    resizeObserver.observe(content);

    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [handleIntersections, scheduleEvaluation, segmentsSignature]);

  useEffect(() => () => {
    const pendingFrame = frameRef.current;
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
  }, []);

  const renderSegment = (segment: ScrollSegment) => {
    const spacerHeight = spacers.get(segment.key);
    if (spacerHeight !== undefined) {
      return (
        <div key={segment.key} className={styles.spacer}
          style={{ height: spacerHeight }} data-segment-key={segment.key} />
      );
    }

    return (
      <div key={segment.key} className={styles.segment}
        data-segment-key={segment.key} data-position={segment.position}>
        {segment.paragraphs.map((paragraph) => (
          <p key={paragraph.offset} className={styles.paragraph} data-offset={paragraph.offset}>
            {paragraph.text}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.frame} data-theme={theme} style={containerStyle}>
      <div
        ref={viewportRef} className={styles.viewport} role="region"
        aria-label="Texto do capítulo" tabIndex={0} onScroll={scheduleEvaluation}
      >
        <div ref={contentRef} className={styles.content}>
          {segments.map(renderSegment)}
          {isLoading && (
            <p role="status" className={styles.status}>Carregando…</p>
          )}
          {error !== null && (
            <div role="status" className={styles.error}>
              <span>{error.message}</span>
              <button type="button" onClick={onRetry}>Tentar de novo</button>
            </div>
          )}
          {hasReachedEnd && <p className={styles.end}>Fim do livro</p>}
        </div>
      </div>
    </div>
  );
});

// Topo do texto: primeiro parágrafo cujo fim ainda está abaixo da borda.
function findTopPoint(viewport: HTMLElement): ScrollPoint | null {
  const viewportTop = viewport.getBoundingClientRect().top;
  const paragraphs = Array.from(viewport.querySelectorAll<HTMLElement>("[data-offset]"));
  const topParagraph = paragraphs.find(
    (paragraph) => paragraph.getBoundingClientRect().bottom > viewportTop
  );
  if (topParagraph === undefined) return null;

  const segment = topParagraph.closest<HTMLElement>("[data-position]");
  const rawPosition = segment === null ? null : segment.getAttribute("data-position");
  const rawOffset = topParagraph.getAttribute("data-offset");
  if (rawPosition === null || rawOffset === null) return null;

  return { position: Number(rawPosition), offset: Number(rawOffset) };
}

// Âncora cai no parágrafo que contém o offset; offset ainda não carregado
// devolve null para o componente tentar de novo quando o trecho chegar.
function findParagraph(viewport: HTMLElement, position: number, offset: number): HTMLElement | null {
  const selector = `[data-position="${position}"] [data-offset]`;
  const paragraphs = Array.from(viewport.querySelectorAll<HTMLElement>(selector));
  let candidate: HTMLElement | null = null;

  for (const paragraph of paragraphs) {
    const rawOffset = paragraph.getAttribute("data-offset");
    if (rawOffset === null) continue;

    const paragraphOffset = Number(rawOffset);
    if (paragraphOffset > offset) break;
    candidate = paragraph;
  }
  if (candidate === null) return null;

  // Offset depois do fim do último parágrafo carregado cai na janela seguinte:
  // não é âncora válida até o motor anexar o trecho que o contém.
  const candidateOffset = Number(candidate.getAttribute("data-offset"));
  const candidateText = candidate.textContent ?? "";
  const candidateLength = Array.from(candidateText).length;
  return offset < candidateOffset + candidateLength ? candidate : null;
}
