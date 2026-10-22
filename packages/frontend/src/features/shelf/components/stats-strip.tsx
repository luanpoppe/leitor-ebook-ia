import type { ShelfStats } from "../shelf-stats";
import styles from "./panels.module.css";

interface StatsStripProps {
  stats: ShelfStats;
  isLoading: boolean;
}

export function StatsStrip({ stats, isLoading }: StatsStripProps) {
  const value = (count: number) => (isLoading ? "—" : count);

  return (
    <section className={styles.kpiStrip} aria-label="Resumo da estante">
      <div className={styles.kpiCell}>
        <p className={styles.kpiLabel}>Livros</p>
        <p className={styles.kpiValue}>{value(stats.total)}</p>
        <p className={styles.kpiCaption}>na biblioteca</p>
      </div>
      <div className={styles.kpiCell}>
        <p className={styles.kpiLabel}>Prontos</p>
        <p className={styles.kpiValue}>{value(stats.ready)}</p>
        <p className={styles.kpiCaption}>para abrir e conversar</p>
      </div>
      <div className={styles.kpiCell}>
        <p className={styles.kpiLabel}>Em preparo</p>
        <p className={styles.kpiValue}>{value(stats.active)}</p>
        <p className={styles.kpiCaption}>na fila de ingestão</p>
      </div>
    </section>
  );
}
