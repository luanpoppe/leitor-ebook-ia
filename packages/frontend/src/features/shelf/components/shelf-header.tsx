"use client";

import { ShelfStatsBuilder } from "../shelf-stats";
import type { ShelfStats } from "../shelf-stats";
import styles from "./shelf-page.module.css";

interface ShelfHeaderProps {
  stats: ShelfStats;
  isLoading: boolean;
  onRefresh: () => void;
  onUpload: () => void;
}

export function ShelfHeader({
  stats,
  isLoading,
  onRefresh,
  onUpload,
}: ShelfHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>Sua estante</h1>
        <p className={styles.subline}>
          {ShelfStatsBuilder.finding(stats, isLoading)}
        </p>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onRefresh} className={styles.refresh}>
          Atualizar
        </button>
        <button type="button" onClick={onUpload} className={styles.primary}>
          Enviar livro
        </button>
      </div>
    </header>
  );
}
