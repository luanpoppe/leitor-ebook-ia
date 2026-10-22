"use client";

import { useCallback, useEffect, useRef } from "react";
import { saveReadingProgress } from "./api";
import { ReaderProgressBeacon } from "./reader-progress-beacon";

// Ficar 2 s parado no mesmo ponto já conta como "terminei de rolar".
export const SAVE_DEBOUNCE_MS = 2_000;

interface ReadingPoint {
  chapterPosition: number;
  offset: number;
}

export function useReadingProgressWriter(
  bookId: string,
  savedPoint: ReadingPoint | null = null
): {
  scheduleSave: (chapterPosition: number, offset: number) => void;
} {
  const pendingRef = useRef<ReadingPoint | null>(null);
  const lastSavedRef = useRef<ReadingPoint | null>(savedPoint);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O progresso salvo chega depois da primeira renderização; marcá-lo como
  // "já gravado" evita um PUT redundante quando a tela reporta o ponto restaurado.
  const savedPosition = savedPoint?.chapterPosition ?? null;
  const savedOffset = savedPoint?.offset ?? null;
  useEffect(() => {
    if (savedPosition === null || savedOffset === null) return;

    lastSavedRef.current = { chapterPosition: savedPosition, offset: savedOffset };
  }, [savedPosition, savedOffset]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    if (pending === null) return;

    pendingRef.current = null;
    // Marca antes do PUT para que um scheduleSave idêntico durante a requisição
    // não dispare outra escrita; o catch desfaz a marca se o PUT falhar.
    lastSavedRef.current = pending;

    const input = {
      chapterPosition: pending.chapterPosition,
      offset: pending.offset,
    };
    const request = saveReadingProgress(bookId, input);
    request.catch(() => {
      // Gravação é best-effort: engolir o erro mantém a leitura fluindo, e
      // liberar a marca permite que a próxima mudança tente o mesmo ponto.
      const isStillMarked = isSamePoint(lastSavedRef.current, pending);
      if (isStillMarked) lastSavedRef.current = null;
    });
  }, [bookId]);

  const scheduleSave = useCallback(
    (chapterPosition: number, offset: number) => {
      const pending = pendingRef.current;
      const isChapterChange =
        pending !== null && pending.chapterPosition !== chapterPosition;
      // Troca de capítulo descarrega o ponto anterior antes de agendar o novo,
      // senão um flush posterior perderia a posição do capítulo que ficou para trás.
      if (isChapterChange) flush();

      const nextPoint = { chapterPosition, offset };
      const isSameAsPending =
        pending !== null && isSamePoint(pending, nextPoint);
      const isAlreadySaved = isSamePoint(lastSavedRef.current, nextPoint);
      if (isSameAsPending || isAlreadySaved) return;

      pendingRef.current = nextPoint;

      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      if (!isHidden) return;
      flush();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flush]);

  useEffect(() => {
    const handlePageHide = () => {
      const pending = pendingRef.current;
      if (pending === null) return;

      pendingRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const input = {
        chapterPosition: pending.chapterPosition,
        offset: pending.offset,
      };
      // `flush` normal pode ser abortado no unload; o beacon é o caminho seguro.
      ReaderProgressBeacon.send(bookId, input);
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [bookId]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { scheduleSave };
}

function isSamePoint(
  left: ReadingPoint | null,
  right: ReadingPoint
): boolean {
  if (left === null) return false;

  return (
    left.chapterPosition === right.chapterPosition && left.offset === right.offset
  );
}
