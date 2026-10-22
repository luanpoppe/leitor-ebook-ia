import {
  formatBytes,
  formatDate,
  formatExtension,
} from "@/features/ebooks/format";
import type { EbookDetail } from "@/features/ebooks/types";
import styles from "./detail.module.css";

interface DetailFactsProps {
  ebook: EbookDetail;
}

export function DetailFacts({ ebook }: DetailFactsProps) {
  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt className={styles.factLabel}>Formato</dt>
        <dd className={styles.factValue}>
          {formatExtension(ebook.format)} · {formatBytes(ebook.size)}
        </dd>
      </div>
      <div className={styles.fact}>
        <dt className={styles.factLabel}>Enviado em</dt>
        <dd className={styles.factValue}>{formatDate(ebook.createdAt)}</dd>
      </div>
      <div className={styles.fact}>
        <dt className={styles.factLabel}>Identificador</dt>
        <dd className={`${styles.factValue} ${styles.factMono}`}>
          {ebook.id.slice(0, 8)}
        </dd>
      </div>
    </dl>
  );
}
