"use client";

import type { JSX } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import styles from "./notes.module.css";

interface NoteMarkdownProps {
  content: string;
}

/** Markdown das anotações; mesma stack das respostas do chat. */
export function NoteMarkdown({ content }: NoteMarkdownProps): JSX.Element {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</Markdown>
    </div>
  );
}
