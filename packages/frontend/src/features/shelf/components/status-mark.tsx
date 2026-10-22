import { StatusLabels } from "../status-labels";
import type { StatusTone } from "../status-labels";
import type { EbookStatus } from "@/features/ebooks/types";
import styles from "./status-mark.module.css";

interface StatusMarkProps {
  status: EbookStatus;
  variant?: "inline" | "pill";
}

const PILL_CLASS_NAMES: Record<StatusTone, string> = {
  ready: styles.pillReady,
  processing: styles.pillProcessing,
  pending: styles.pillPending,
  failed: styles.pillFailed,
};

export function StatusMark({ status, variant = "inline" }: StatusMarkProps) {
  const tone = StatusLabels.tone(status);
  const label = StatusLabels.label(status);
  const pillClassName = `${styles.pill} ${PILL_CLASS_NAMES[tone]}`;

  if (variant === "pill") {
    return <span className={pillClassName}>{label}</span>;
  }

  if (status === "ready") {
    return (
      <span className={styles.ready}>
        <span className={styles.dot} />
        {label}
      </span>
    );
  }

  return <span className={pillClassName}>{label}</span>;
}
