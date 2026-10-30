import type { JSX, MouseEvent } from "react";
import type { BookHighlight } from "../api";
import styles from "./highlighted-text.module.css";

interface HighlightedTextProps {
  text: string;
  /** Offset absoluto do parágrafo no capítulo (code points). */
  startOffset: number;
  highlights: BookHighlight[];
  onHighlightClick?(highlight: BookHighlight, rect: DOMRect): void;
}

interface TextPart {
  text: string;
  highlight: BookHighlight | null;
}

/**
 * Texto de um parágrafo com as marcações daquele capítulo aplicadas. Os
 * offsets são code points, então o texto é percorrido como lista de caracteres
 * para não deslocar o destaque em trechos com emoji.
 */
export function HighlightedText({
  text,
  startOffset,
  highlights,
  onHighlightClick,
}: HighlightedTextProps): JSX.Element {
  const parts = splitByHighlights(text, startOffset, highlights);

  return (
    <>
      {parts.map((part, index) => {
        if (part.highlight === null) {
          return <span key={`plain:${index}`}>{part.text}</span>;
        }

        const highlight = part.highlight;
        const handleClick = (event: MouseEvent<HTMLElement>): void => {
          // Arrastar para selecionar o próprio texto não abre a remoção.
          if (window.getSelection()?.isCollapsed === false) return;

          event.stopPropagation();
          onHighlightClick?.(
            highlight,
            event.currentTarget.getBoundingClientRect()
          );
        };

        return (
          <mark
            key={`${highlight.id}:${index}`}
            className={styles.highlight}
            data-color={highlight.color}
            title="Clique para remover esta marcação"
            onClick={handleClick}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

function splitByHighlights(
  text: string,
  startOffset: number,
  highlights: BookHighlight[]
): TextPart[] {
  const codePoints = Array.from(text);
  const endOffset = startOffset + codePoints.length;
  const overlapping = highlights
    .filter(
      (highlight) =>
        highlight.startOffset < endOffset &&
        highlight.endOffset > startOffset
    )
    .sort((left, right) => left.startOffset - right.startOffset);

  if (overlapping.length === 0) return [{ text, highlight: null }];

  const parts: TextPart[] = [];
  let cursor = 0;

  for (const highlight of overlapping) {
    const start = Math.max(0, highlight.startOffset - startOffset);
    const end = Math.min(codePoints.length, highlight.endOffset - startOffset);
    if (end <= cursor) continue;

    if (start > cursor) {
      parts.push({
        text: codePoints.slice(cursor, start).join(""),
        highlight: null,
      });
    }

    const highlightedStart = Math.max(start, cursor);
    parts.push({
      text: codePoints.slice(highlightedStart, end).join(""),
      highlight,
    });
    cursor = end;
  }

  if (cursor < codePoints.length) {
    parts.push({
      text: codePoints.slice(cursor).join(""),
      highlight: null,
    });
  }

  return parts;
}
