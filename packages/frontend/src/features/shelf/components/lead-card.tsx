"use client";

import { formatDate, formatExtension } from "@/features/ebooks/format";
import type { EbookSummary } from "@/features/ebooks/types";
import { ShortTitle } from "../short-title";
import { BookCover } from "./book-cover";
import styles from "./panels.module.css";

interface LeadCardProps {
  ebook: EbookSummary;
  onOpen: (id: string) => void;
}

export function LeadCard({ ebook, onOpen }: LeadCardProps) {
  const handleOpen = () => onOpen(ebook.id);

  return (
    <section className={styles.lead} aria-labelledby="shelf-lead-title">
      <BookCover
        title={ebook.title}
        coverUrl={ebook.coverUrl}
        format={ebook.format}
        variant="lead"
      />

      <div className={styles.leadBody}>
        <p className={styles.leadLabel}>Mais recente na estante</p>
        <h2 id="shelf-lead-title" className={styles.leadTitle}>
          {ShortTitle.of(ebook.title)}
        </h2>
        {ebook.author && <p className={styles.leadAuthor}>{ebook.author}</p>}

        <div className={styles.leadActions}>
          <button type="button" onClick={handleOpen} className={styles.leadOpen}>
            Abrir livro
          </button>
          <span className={styles.leadMeta}>
            {formatExtension(ebook.format)} · {formatDate(ebook.createdAt)}
          </span>
        </div>
      </div>
    </section>
  );
}
