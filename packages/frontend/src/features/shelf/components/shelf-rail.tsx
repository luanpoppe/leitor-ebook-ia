"use client";

import type { EbookSummary } from "@/features/ebooks/types";
import { StatusLabels } from "../status-labels";
import type { UseEbookFileDropResult } from "../hooks/use-ebook-file-drop";
import { RailBookItem } from "./rail-book-item";
import { UploadPanel } from "./upload-panel";
import styles from "./rail.module.css";

const RECENT_ITEMS = 3;

interface ShelfRailProps {
  ebooks: EbookSummary[];
  drop: UseEbookFileDropResult;
  onOpen: (id: string) => void;
}

export function ShelfRail({ ebooks, drop, onOpen }: ShelfRailProps) {
  const activeBooks = ebooks.filter((ebook) =>
    StatusLabels.isActive(ebook.status)
  );
  const recentBooks = ebooks.slice(0, RECENT_ITEMS);

  return (
    <aside className={styles.rail}>
      <section className={styles.railSection}>
        <h2 className={styles.railHeading}>Enviar</h2>
        <UploadPanel drop={drop} />
      </section>

      <section className={styles.railSection}>
        <h2 className={styles.railHeading}>
          Em preparo
          <span className={styles.railCount}>{activeBooks.length}</span>
        </h2>

        {activeBooks.length === 0 ? (
          <p className={styles.railEmpty}>Nada na fila agora.</p>
        ) : (
          <div className={styles.railCard}>
            <ul className={styles.railList}>
              {activeBooks.map((ebook) => (
                <RailBookItem key={ebook.id} ebook={ebook} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.railSection}>
        <h2 className={styles.railHeading}>Últimos envios</h2>

        <div className={styles.railCard}>
          <ul className={styles.railList}>
            {recentBooks.map((ebook) => (
              <RailBookItem key={ebook.id} ebook={ebook} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      </section>
    </aside>
  );
}
