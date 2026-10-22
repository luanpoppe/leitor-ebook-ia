"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CSSProperties, JSX } from "react";
import type { ChapterPage } from "../types";
import type { ReaderTheme } from "../reader-preferences";
import styles from "./reader-chapter-view.module.css";

const PARAGRAPH_SEPARATOR = "\n\n";
const PARAGRAPH_SEPARATOR_LENGTH = PARAGRAPH_SEPARATOR.length;

interface ReaderChapterViewProps {
  chapter: ChapterPage;
  fontSize: number;
  theme: ReaderTheme;
  resumeOffset: number;
  onPositionChange: (position: number, offset: number) => void;
}

interface ChapterParagraph {
  offset: number;
  text: string;
}

export function ReaderChapterView({
  chapter,
  fontSize,
  theme,
  resumeOffset,
  onPositionChange,
}: ReaderChapterViewProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);

  const paragraphs = useMemo(
    () => splitIntoParagraphs(chapter.text),
    [chapter.text]
  );

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    // Offset além do texto (capítulo encurtou) volta ao início em vez de
    // grudar no último parágrafo.
    const isOffsetBeyondChapter = resumeOffset >= chapter.totalLength;
    const appliedOffset = isOffsetBeyondChapter ? 0 : resumeOffset;
    scrollToOffset(viewport, appliedOffset);

    // Reportar o ponto restaurado grava a troca de capítulo mesmo sem rolagem.
    const reportPosition = onPositionChangeRef.current;
    reportPosition(chapter.position, appliedOffset);
  }, [chapter.id, chapter.position, chapter.totalLength, resumeOffset]);

  useEffect(() => {
    return () => {
      const frameId = animationFrameRef.current;
      if (frameId === null) return;

      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const isFrameScheduled = animationFrameRef.current !== null;
    if (isFrameScheduled) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;

      const viewport = viewportRef.current;
      if (viewport === null) return;

      const offset = findVisibleOffset(viewport);
      const reportPosition = onPositionChangeRef.current;
      reportPosition(chapter.position, offset);
    });
  }, [chapter.position]);

  const containerStyle = {
    "--reader-font-size": `${fontSize}px`,
  } as CSSProperties;

  return (
    <div className={styles.frame} data-theme={theme} style={containerStyle}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-label="Texto do capítulo"
        tabIndex={0}
        onScroll={handleScroll}
      >
        <div className={styles.content}>
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph.offset}
              className={styles.paragraph}
              data-offset={paragraph.offset}
            >
              {paragraph.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function splitIntoParagraphs(text: string): ChapterParagraph[] {
  const rawParagraphs = text.split(PARAGRAPH_SEPARATOR);
  const paragraphs: ChapterParagraph[] = [];
  let offset = 0;

  for (const paragraph of rawParagraphs) {
    const isNonEmpty = paragraph.length > 0;
    if (isNonEmpty) paragraphs.push({ offset, text: paragraph });

    offset += paragraph.length + PARAGRAPH_SEPARATOR_LENGTH;
  }

  return paragraphs;
}

function findVisibleOffset(viewport: HTMLElement): number {
  const viewportTop = viewport.getBoundingClientRect().top;
  const paragraphElements = viewport.querySelectorAll<HTMLElement>("[data-offset]");
  let firstVisibleOffset = 0;

  for (const paragraphElement of paragraphElements) {
    const paragraphRect = paragraphElement.getBoundingClientRect();
    const isPastViewportTop = paragraphRect.bottom > viewportTop;
    if (isPastViewportTop) return readParagraphOffset(paragraphElement);

    firstVisibleOffset = readParagraphOffset(paragraphElement);
  }

  return firstVisibleOffset;
}

function scrollToOffset(viewport: HTMLElement, offset: number): void {
  const isStartRequested = offset <= 0;
  if (isStartRequested) {
    viewport.scrollTop = 0;
    return;
  }

  const paragraphElements = viewport.querySelectorAll<HTMLElement>("[data-offset]");
  let targetElement: HTMLElement | null = null;

  for (const paragraphElement of paragraphElements) {
    const paragraphOffset = readParagraphOffset(paragraphElement);
    if (paragraphOffset > offset) break;

    targetElement = paragraphElement;
  }

  if (targetElement === null) return;

  const viewportTop = viewport.getBoundingClientRect().top;
  const targetTop = targetElement.getBoundingClientRect().top;
  const distanceToTarget = targetTop - viewportTop;
  viewport.scrollTop += distanceToTarget;
}

function readParagraphOffset(paragraphElement: HTMLElement): number {
  const rawOffset = paragraphElement.dataset.offset ?? "0";
  return Number(rawOffset);
}
