"use client";

import { useEffect, useRef } from "react";
import type { JSX, MouseEvent as ReactMouseEvent } from "react";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import type { ChapterSummary } from "../types";
import styles from "./reader-toc-drawer.module.css";

const TOC_TITLE_ID = "reader-toc-title";

interface ReaderTocDrawerProps {
  chapters: ChapterSummary[];
  currentPosition: number | null;
  onSelect: (position: number) => void;
  onClose: () => void;
}

function getChapterLabel(chapter: ChapterSummary): string {
  if (chapter.title === null) return `Capítulo ${chapter.position}`;

  return chapter.title;
}

export function ReaderTocDrawer({
  chapters,
  currentPosition,
  onSelect,
  onClose,
}: ReaderTocDrawerProps): JSX.Element {
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const currentItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const currentItem = currentItemRef.current;
    if (currentItem === null) return;

    currentItem.scrollIntoView({ block: "nearest" });
  }, []);

  const handlePanelClick = (event: ReactMouseEvent) => event.stopPropagation();

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TOC_TITLE_ID}
        className={styles.panel}
        onClick={handlePanelClick}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 id={TOC_TITLE_ID} className={styles.title}>
            Sumário
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar sumário"
            onClick={onClose}
            className={styles.closeButton}
          >
            Fechar
          </button>
        </header>

        <ol className={styles.list}>
          {chapters.map((chapter) => {
            const isCurrent = chapter.position === currentPosition;
            const itemClassName = isCurrent
              ? `${styles.item} ${styles.currentItem}`
              : styles.item;

            return (
              <li key={chapter.id}>
                <button
                  ref={isCurrent ? currentItemRef : undefined}
                  type="button"
                  aria-current={isCurrent ? "location" : undefined}
                  onClick={() => onSelect(chapter.position)}
                  className={itemClassName}
                >
                  <span className={styles.itemPosition}>{chapter.position}</span>
                  <span className={styles.itemTitle}>
                    {getChapterLabel(chapter)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
