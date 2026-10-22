"use client";

import type { JSX, ReactNode } from "react";
import styles from "./reader-message.module.css";

interface ReaderMessageProps {
  title: string;
  description: string;
  isEndOfBook?: boolean;
  children: ReactNode;
}

export function ReaderMessage({
  title,
  description,
  isEndOfBook = false,
  children,
}: ReaderMessageProps): JSX.Element {
  const titleClassName = isEndOfBook
    ? `${styles.messageTitle} ${styles.endTitle}`
    : styles.messageTitle;

  return (
    <section className={styles.message} aria-live="polite">
      <h1 className={titleClassName}>{title}</h1>
      <p className={styles.messageText}>{description}</p>
      <div className={styles.actions}>{children}</div>
    </section>
  );
}
