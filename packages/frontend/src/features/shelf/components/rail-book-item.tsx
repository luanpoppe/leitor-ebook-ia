"use client";

import Link from "next/link";
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
  const isReady = ebook.status === "ready";
  const readingHref = `/ebooks/${ebook.id}/ler`;
  const handleOpen = () => onOpen(ebook.id);

  const itemContent = (
    <>
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
    </>
  );

  return (
    <li className={styles.railItem}>
      {isReady ? (
        <Link
          href={readingHref}
          className={styles.railItemButton}
          aria-label={`Ler ${ebook.title}`}
        >
          {itemContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={styles.railItemButton}
          aria-label={`Ver detalhes de ${ebook.title}`}
        >
          {itemContent}
        </button>
      )}
    </li>
  );
}
