"use client";

import type { JSX } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { ChatCitation } from "./types";
import styles from "./reader-chat-drawer.module.css";

interface ChatMessageTextProps {
  content: string;
  citations: ChatCitation[];
  onCitationSelect(citation: ChatCitation): void;
}

const CITATION_LINK_PREFIX = "#cite-";
// Só `[2]` isolado vira link: `[texto](url)` do markdown fica intacto.
const CITATION_MARK_PATTERN = /\[(\d+)\](?!\()/g;

/**
 * Resposta da IA em markdown, com as citações `[n]` virando botões que abrem o
 * trecho no livro. Marcador sem citação correspondente continua como texto.
 */
export function ChatMessageText({
  content,
  citations,
  onCitationSelect,
}: ChatMessageTextProps): JSX.Element {
  const markdown = withCitationLinks(content);

  return (
    <div className={styles.messageText}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children }) => {
            const citation = resolveCitationLink(href, citations);
            if (citation === null) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }

            return (
              <button
                type="button"
                onClick={() => onCitationSelect(citation)}
                className={styles.citationMark}
                aria-label={`Abrir ${describeCitation(citation)}`}
              >
                {children}
              </button>
            );
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

function withCitationLinks(content: string): string {
  return content.replace(
    CITATION_MARK_PATTERN,
    (_match, index: string) => `[${index}](${CITATION_LINK_PREFIX}${index})`
  );
}

function resolveCitationLink(
  href: string | undefined,
  citations: ChatCitation[]
): ChatCitation | null {
  if (href === undefined) return null;
  if (!href.startsWith(CITATION_LINK_PREFIX)) return null;

  const index = Number(href.slice(CITATION_LINK_PREFIX.length));
  const citation = citations.find((item) => item.index === index);
  return citation ?? null;
}

export function describeCitation(citation: ChatCitation): string {
  if (citation.chapterTitle !== null) {
    return `capítulo ${citation.chapterPosition} — ${citation.chapterTitle}`;
  }

  return `capítulo ${citation.chapterPosition}`;
}
