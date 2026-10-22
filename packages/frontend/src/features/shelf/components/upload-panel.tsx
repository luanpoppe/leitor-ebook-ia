"use client";

import type { UseEbookFileDropResult } from "../hooks/use-ebook-file-drop";
import styles from "./rail.module.css";

interface UploadPanelProps {
  drop: UseEbookFileDropResult;
}

export function UploadPanel({ drop }: UploadPanelProps) {
  const errorMessage = drop.localError ?? drop.serverError;

  const uploadClassName = [
    styles.upload,
    drop.isDragging ? styles.uploadDragging : "",
    drop.isUploading ? styles.uploadBusy : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={uploadClassName} {...drop.rootProps}>
        <input {...drop.inputProps} />

        <p className={styles.uploadTitle}>Traga um livro novo</p>
        <p className={styles.uploadHint}>
          EPUB, PDF, TXT ou MD, até 50 MB. Arraste ou escolha o arquivo.
        </p>

        {drop.isUploading ? (
          <>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${drop.progress}%` }}
              />
            </div>
            <span className={styles.uploadButton}>{drop.progress}%</span>
          </>
        ) : (
          <span className={styles.uploadButton}>Escolher arquivo</span>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className={styles.uploadError}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
