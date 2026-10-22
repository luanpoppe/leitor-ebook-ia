"use client";

import { formatExtension } from "@/features/ebooks/format";
import type { EbookSummary } from "@/features/ebooks/types";
import { StatusLabels } from "../status-labels";
import { BookCover } from "./book-cover";
import styles from "./rail.module.css";

interface RailBookItemProps {
  ebook: EbookSummary;
  onOpen: (id: string) => void;
}

export function RailBookItem({ ebook, onOpen }: RailBookItemProps) {
  const handleOpen = () => onOpen(ebook.id);

  return (
    <li className={styles.railItem}>
      <button
        type="button"
        onClick={handleOpen}
        className={styles.railItemButton}
        aria-label={`Abrir ${ebook.title}`}
      >
        <BookCover
          title={ebook.title}
          coverUrl={ebook.coverUrl}
          format={ebook.format}
          variant="rail"
        />

        <span className={styles.railBody}>
          <span className={styles.railTitle}>{ebook.title}</span>
          <span className={styles.railMeta}>
            {formatExtension(ebook.format)} ·{" "}
            {StatusLabels.label(ebook.status)}
          </span>
        </span>
      </button>
    </li>
  );
}
