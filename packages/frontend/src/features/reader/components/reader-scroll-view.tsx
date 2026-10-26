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
import type { ReaderAlignment, ReaderTheme } from "../reader-preferences";
import type { ScrollErrorDirection, ScrollSegment } from "../use-reader-scroll";
import styles from "./reader-scroll-view.module.css";

const SEGMENT_KEY_ATTRIBUTE = "data-segment-key";
const SEGMENT_ROOT_MARGIN = "150% 0px";
const LOAD_MORE_SCREENS = 1.5;
const LOAD_PREVIOUS_SCREENS = 1;
// Uma tela de teclado fica um pouco menor que a área para o leitor não perder
// a linha de referência entre uma rolagem e outra.
const SCROLL_PAGE_FRACTION = 0.9;
const PARAGRAPH_BREAK = "\n";
const EMPTY_SPACERS: ReadonlyMap<string, number> = new Map();
const EMPTY_KEYS: ReadonlySet<string> = new Set();

interface ScrollPoint {
  position: number;
  offset: number;
}

/** Posição de um trecho montado, para corrigir a rolagem depois do reflow. */
interface LayoutAnchor {
  key: string;
  offsetTop: number;
}

export interface ReaderScrollViewHandle {
  /** Rola até o parágrafo do offset pedido, se ele estiver carregado. */
  scrollToOffset(position: number, offset: number): void;
  /** Rola uma fração da tela: 1 desce, -1 sobe. */
  scrollByPage(direction: -1 | 1, fraction?: number): void;
}

export interface ReaderScrollViewProps {
  segments: ScrollSegment[];
  isLoading: boolean;
  error: Error | null;
  /** Lado onde a carga falhou: o aviso aparece acima ou abaixo do texto. */
  errorDirection: ScrollErrorDirection;
  hasReachedEnd: boolean;
  fontSize: number;
  theme: ReaderTheme;
  alignment: ReaderAlignment;
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
    segments, isLoading, error, errorDirection, hasReachedEnd, fontSize, theme,
    alignment, anchor, onLoadMore, onLoadPrevious, onRetry, onVisibleChange,
  } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const reanchorFrameRef = useRef<number | null>(null);
  // Altura de cada trecho que saiu do DOM. O espaçador ocupa o mesmo espaço,
  // então a barra de rolagem e a posição não pulam ao descartar conteúdo.
  const [spacers, setSpacers] = useState(EMPTY_SPACERS);
  const [fontEpoch, setFontEpoch] = useState(0);

  const firstKeyRef = useRef<string | null>(null);
  const previousKeysRef = useRef<ReadonlySet<string>>(EMPTY_KEYS);
  // Trechos montados antes da última mudança: qualquer um que sobreviva serve
  // de âncora (todos deslocam igual) e o delta do offsetTop dá a altura que
  // entrou por cima, mesmo quando o mais antigo é descartado.
  const layoutAnchorsRef = useRef<readonly LayoutAnchor[]>([]);
  const lastScrollHeightRef = useRef(0);
  const lastContentWidthRef = useRef(0);
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

  const scrollByPage = useCallback(
    (direction: -1 | 1, fraction: number = SCROLL_PAGE_FRACTION): void => {
      const viewport = viewportRef.current;
      if (viewport === null) return;

      const distance = viewport.clientHeight * fraction * direction;
      viewport.scrollTop += distance;
    },
    []
  );

  // Resize e fonte mudam o layout sem mudar o texto: medir agora pegaria o
  // reflow antigo, então a reancoragem espera um frame.
  const scheduleReanchor = useCallback((): void => {
    const pendingFrame = reanchorFrameRef.current;
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);

    reanchorFrameRef.current = requestAnimationFrame(() => {
      reanchorFrameRef.current = null;
      const point = visiblePointRef.current;
      if (point === null) return;
      scrollToOffset(point.position, point.offset);
    });
  }, [scrollToOffset]);

  // Assinatura só muda quando o conjunto de trechos muda: gatilho para
  // recriar o observer, não para cada parágrafo novo no mesmo trecho.
  const segmentsSignature = segments.map((segment) => segment.key).join("|");
  const containerStyle = { "--reader-font-size": `${fontSize}px` } as CSSProperties;

  // A fonte pode terminar de carregar depois da primeira renderização; sem
  // reancorar, o topo medido com a fonte de fallback fica no lugar errado.
  useEffect(() => {
    const fontSet = document.fonts;
    if (fontSet === undefined) return;

    let isMounted = true;
    const bumpFontEpoch = (): void => {
      if (!isMounted) return;
      setFontEpoch((epoch) => epoch + 1);
    };

    void fontSet.ready.then(bumpFontEpoch);
    fontSet.addEventListener("loadingdone", bumpFontEpoch);

    return () => {
      isMounted = false;
      fontSet.removeEventListener("loadingdone", bumpFontEpoch);
    };
  }, []);

  useEffect(() => {
    // Época 0 é a primeira medição, feita antes de o texto estar na tela.
    if (fontEpoch === 0) return;

    scheduleReanchor();
  }, [fontEpoch, scheduleReanchor]);

  // Mudar a fonte remede todo trecho montado: o ponto é guardado antes do
  // commit e reaplicado um frame depois do reflow. O custo de remontar os
  // trechos ainda existe e segue aceito neste recorte.
  useLayoutEffect(() => {
    restorePointRef.current = visiblePointRef.current;
    setSpacers(EMPTY_SPACERS);

    const frame = requestAnimationFrame(() => {
      const restorePoint = restorePointRef.current;
      if (restorePoint === null) return;
      restorePointRef.current = null;
      scrollToOffset(restorePoint.position, restorePoint.offset);
    });
    return () => cancelAnimationFrame(frame);
  }, [fontSize, scrollToOffset]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const firstKey = segments[0]?.key ?? null;
    const previousFirstKey = firstKeyRef.current;
    const isFirstChanged =
      previousFirstKey !== null && firstKey !== previousFirstKey;
    const currentKeys = new Set(segments.map((segment) => segment.key));
    const previousKeys = previousKeysRef.current;
    const hasPreviousKeySurviving =
      previousKeys.size > 0 && hasAnyKey(currentKeys, previousKeys);
    // Troca de capítulo zera a lista e não tem o que compensar.
    const shouldCompensate = isFirstChanged && hasPreviousKeySurviving;

    if (shouldCompensate) {
      const didCompensate = compensateLayoutShift(
        viewport,
        layoutAnchorsRef.current,
        previousKeys,
        currentKeys
      );
      // Sem âncora viva o total do conteúdo ainda diz quanto entrou por cima.
      if (!didCompensate) {
        viewport.scrollTop += viewport.scrollHeight - lastScrollHeightRef.current;
      }
    }

    firstKeyRef.current = firstKey;
    previousKeysRef.current = currentKeys;
    lastScrollHeightRef.current = viewport.scrollHeight;
    layoutAnchorsRef.current = captureLayoutAnchors(viewport);
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
    scrollByPage(direction: -1 | 1, fraction?: number): void {
      scrollByPage(direction, fraction);
    },
  }), [scrollByPage, scrollToOffset]);

  const evaluateScroll = useCallback((): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const top = findTopPoint(viewport);
    if (top !== null) {
      layoutAnchorsRef.current = captureLayoutAnchors(viewport);
      const pointKey = `${top.position}:${top.offset}`;
      if (pointKey !== visibleKeyRef.current) {
        visibleKeyRef.current = pointKey;
        visiblePointRef.current = top;
        onVisibleChange(top.position, top.offset);
      }
    }

    const topToEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearEnd = topToEnd < viewport.clientHeight * LOAD_MORE_SCREENS;
    const isNearStart =
      viewport.scrollTop < viewport.clientHeight * LOAD_PREVIOUS_SCREENS;
    // Fim do livro e falha param só a carga de baixo: o aviso no pé muda a
    // altura do conteúdo e, sem isso, dispararia a mesma busca em loop. Subir
    // continua valendo, para o leitor não ficar preso no fim do livro.
    const canLoadMore = isNearEnd && !isLoading && !hasReachedEnd && error === null;

    if (canLoadMore) {
      onLoadMore();
      return;
    }
    if (isNearStart && !isLoading) onLoadPrevious();
  }, [error, hasReachedEnd, isLoading, onLoadMore, onLoadPrevious, onVisibleChange]);

  const scheduleEvaluation = useCallback((): void => {
    const pendingFrame = frameRef.current;
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      evaluateScroll();
    });
  }, [evaluateScroll]);

  const handleContentResize = useCallback(
    (): void => {
      const content = contentRef.current;
      if (content === null) return;

      // Altura muda a cada trecho anexado; só a largura invalida o topo.
      const width = content.clientWidth;
      const isWidthChanged = width !== lastContentWidthRef.current;
      lastContentWidthRef.current = width;
      if (isWidthChanged) scheduleReanchor();

      scheduleEvaluation();
    },
    [scheduleEvaluation, scheduleReanchor]
  );

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
    lastContentWidthRef.current = content.clientWidth;
    const resizeObserver = new ResizeObserver(handleContentResize);
    resizeObserver.observe(content);

    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [handleContentResize, handleIntersections, segmentsSignature]);

  useEffect(() => () => {
    const pendingFrame = frameRef.current;
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);

    const pendingReanchorFrame = reanchorFrameRef.current;
    if (pendingReanchorFrame !== null) cancelAnimationFrame(pendingReanchorFrame);
  }, []);

  const renderSegment = (segment: ScrollSegment, index: number): JSX.Element => {
    const spacerHeight = spacers.get(segment.key);
    if (spacerHeight !== undefined) {
      return (
        <div key={segment.key} className={styles.spacer}
          style={{ height: spacerHeight }} data-segment
          data-segment-key={segment.key} />
      );
    }

    const previousSegment = segments[index - 1];
    // O trecho anterior terminou no meio de um parágrafo: a fronteira entre os
    // dois não pode abrir o espaçamento de parágrafo novo.
    const startsInsideParagraph =
      previousSegment !== undefined &&
      previousSegment.lastChar !== PARAGRAPH_BREAK;
    const endsInsideParagraph = segment.lastChar !== PARAGRAPH_BREAK;

    return (
      <div key={segment.key} className={styles.segment} data-segment
        data-segment-key={segment.key} data-position={segment.position}>
        {segment.paragraphs.map((paragraph, paragraphIndex) => (
          <p
            key={paragraph.offset}
            className={resolveParagraphClassName(
              paragraphIndex,
              segment.paragraphs.length,
              startsInsideParagraph,
              endsInsideParagraph
            )}
            data-offset={paragraph.offset}
          >
            {paragraph.text}
          </p>
        ))}
      </div>
    );
  };

  const errorNotice = error === null ? null : (
    <div role="status" className={styles.error}>
      <span>{error.message}</span>
      <button type="button" onClick={onRetry}>Tentar de novo</button>
    </div>
  );
  const isPrependError = errorDirection === "prepend";

  return (
    <div
      className={styles.frame}
      data-theme={theme}
      data-alignment={alignment}
      style={containerStyle}
    >
      <div
        ref={viewportRef} className={styles.viewport} role="region"
        aria-label="Texto do capítulo" tabIndex={0} onScroll={scheduleEvaluation}
      >
        <div ref={contentRef} className={styles.content}>
          {isPrependError ? errorNotice : null}
          {segments.map(renderSegment)}
          {isLoading && (
            <p role="status" className={styles.status}>Carregando…</p>
          )}
          {isPrependError ? null : errorNotice}
          {hasReachedEnd && <p className={styles.end}>Fim do livro</p>}
        </div>
      </div>
    </div>
  );
});

// Primeiro trecho visível (espaçador fica de fora: ele não tem parágrafos).
function findTopSegment(viewport: HTMLElement): HTMLElement | null {
  const viewportTop = viewport.getBoundingClientRect().top;
  const segmentElements = viewport.querySelectorAll<HTMLElement>("[data-segment]");

  for (const element of segmentElements) {
    const isSpacer = element.getAttribute("data-position") === null;
    if (isSpacer) continue;

    const rect = element.getBoundingClientRect();
    if (rect.bottom > viewportTop) return element;
  }

  return null;
}

// Topo do texto: primeiro parágrafo do trecho visível cujo fim ainda está
// abaixo da borda. Varrer só esse trecho evita varrer o capítulo por frame.
function findTopPoint(viewport: HTMLElement): ScrollPoint | null {
  const segment = findTopSegment(viewport);
  if (segment === null) return null;

  const viewportTop = viewport.getBoundingClientRect().top;
  const paragraphs = segment.querySelectorAll<HTMLElement>("[data-offset]");

  for (const paragraph of paragraphs) {
    const paragraphRect = paragraph.getBoundingClientRect();
    if (paragraphRect.bottom <= viewportTop) continue;

    const rawPosition = segment.getAttribute("data-position");
    const rawOffset = paragraph.getAttribute("data-offset");
    if (rawPosition === null || rawOffset === null) return null;

    return { position: Number(rawPosition), offset: Number(rawOffset) };
  }

  return null;
}

function captureLayoutAnchors(viewport: HTMLElement): readonly LayoutAnchor[] {
  const segmentElements = viewport.querySelectorAll<HTMLElement>("[data-segment]");
  const anchors: LayoutAnchor[] = [];

  for (const element of segmentElements) {
    const isSpacer = element.getAttribute("data-position") === null;
    if (isSpacer) continue;

    const anchor = toLayoutAnchor(element);
    if (anchor !== null) anchors.push(anchor);
  }

  return anchors;
}

function toLayoutAnchor(segment: HTMLElement): LayoutAnchor | null {
  const key = segment.getAttribute(SEGMENT_KEY_ATTRIBUTE);
  if (key === null) return null;

  return { key, offsetTop: segment.offsetTop };
}

// Trecho que sobreviveu à mudança: o delta do offsetTop dele é a altura que
// entrou por cima. Devolve false quando nenhuma âncora sobreviveu.
function compensateLayoutShift(
  viewport: HTMLElement,
  anchors: readonly LayoutAnchor[],
  previousKeys: ReadonlySet<string>,
  currentKeys: ReadonlySet<string>
): boolean {
  const survivingAnchor = anchors.find(
    (candidate) =>
      previousKeys.has(candidate.key) && currentKeys.has(candidate.key)
  );
  if (survivingAnchor === undefined) return false;

  const anchorElement = findSegmentByKey(viewport, survivingAnchor.key);
  if (anchorElement === null) return false;

  viewport.scrollTop += anchorElement.offsetTop - survivingAnchor.offsetTop;
  return true;
}

function hasAnyKey(
  currentKeys: ReadonlySet<string>,
  previousKeys: ReadonlySet<string>
): boolean {
  for (const key of previousKeys) {
    if (currentKeys.has(key)) return true;
  }

  return false;
}

function findSegmentByKey(
  viewport: HTMLElement,
  key: string
): HTMLElement | null {
  const segmentElements = viewport.querySelectorAll<HTMLElement>("[data-segment]");

  for (const element of segmentElements) {
    const elementKey = element.getAttribute(SEGMENT_KEY_ATTRIBUTE);
    if (elementKey === key) return element;
  }

  return null;
}

function resolveParagraphClassName(
  index: number,
  paragraphCount: number,
  startsInsideParagraph: boolean,
  endsInsideParagraph: boolean
): string {
  const classNames = [styles.paragraph];
  if (index === 0 && startsInsideParagraph) {
    classNames.push(styles.paragraphFlushTop);
  }

  const isLast = index === paragraphCount - 1;
  if (isLast && endsInsideParagraph) {
    classNames.push(styles.paragraphFlushBottom);
  }

  return classNames.join(" ");
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
