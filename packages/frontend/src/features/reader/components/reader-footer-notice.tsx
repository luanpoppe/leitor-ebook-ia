"use client";

import type { JSX } from "react";
import styles from "./reader-footer-notice.module.css";

interface ReaderFooterNoticeProps {
  message: string;
  onRetry(): void;
}

export function ReaderFooterNotice({
  message,
  onRetry,
}: ReaderFooterNoticeProps): JSX.Element {
  return (
    <div role="status" className={styles.notice}>
      <span className={styles.message}>{message}</span>
      <button type="button" onClick={onRetry} className={styles.retryButton}>
        Tentar de novo
      </button>
    </div>
  );
}
