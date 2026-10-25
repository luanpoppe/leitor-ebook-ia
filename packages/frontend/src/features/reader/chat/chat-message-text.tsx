"use client";

import type { JSX } from "react";
import type { ChatCitation } from "./types";
import styles from "./reader-chat-drawer.module.css";

interface ChatMessageTextProps {
  content: string;
  citations: ChatCitation[];
  onCitationSelect(citation: ChatCitation): void;
}

const CITATION_PATTERN = /(\[\d+\])/g;

/**
 * Texto da resposta com as citações `[n]` viram botões que levam ao trecho no
 * livro. Marcador sem citação correspondente fica como texto normal.
 */
export function ChatMessageText({
  content,
  citations,
  onCitationSelect,
}: ChatMessageTextProps): JSX.Element {
  const parts = content.split(CITATION_PATTERN);

  return (
    <p className={styles.messageText}>
      {parts.map((part, index) => {
        const citation = resolveCitation(part, citations);
        if (citation === null) {
          return <span key={index}>{part}</span>;
        }

        return (
          <button
            key={index}
            type="button"
            onClick={() => onCitationSelect(citation)}
            className={styles.citationMark}
            aria-label={`Ir para ${describeCitation(citation)}`}
          >
            {part}
          </button>
        );
      })}
    </p>
  );
}

function resolveCitation(
  part: string,
  citations: ChatCitation[]
): ChatCitation | null {
  const isCitationMark = /^\[\d+\]$/.test(part);
  if (!isCitationMark) return null;

  const index = Number(part.slice(1, -1));
  const citation = citations.find((item) => item.index === index);
  return citation ?? null;
}

export function describeCitation(citation: ChatCitation): string {
  if (citation.chapterTitle !== null) {
    return `capítulo ${citation.chapterPosition} — ${citation.chapterTitle}`;
  }

  return `capítulo ${citation.chapterPosition}`;
}
