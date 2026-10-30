"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { ClipboardUtils } from "@/utils/clipboard";
import styles from "./copy-note-button.module.css";

type CopyStatus = "idle" | "copied" | "error";

const FEEDBACK_DURATION_MS = 2_000;

interface CopyNoteButtonProps {
  content: string;
}

/** Copia o markdown completo da anotação para a área de transferência. */
export function CopyNoteButton({ content }: CopyNoteButtonProps): JSX.Element {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (): Promise<void> => {
    const didCopy = await ClipboardUtils.copy(content);
    setStatus(didCopy ? "copied" : "error");

    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setStatus("idle");
    }, FEEDBACK_DURATION_MS);
  };

  const label =
    status === "copied"
      ? "Copiado!"
      : status === "error"
        ? "Falhou ao copiar"
        : "Copiar";

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void handleCopy()}
      aria-label="Copiar o conteúdo da anotação"
      aria-live="polite"
      title="Copiar o conteúdo da anotação"
    >
      {label}
    </button>
  );
}
