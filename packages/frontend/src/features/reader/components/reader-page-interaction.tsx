"use client";

import { useCallback, useRef } from "react";
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  PageGesture,
  TAP_MAX_TRAVEL_PX,
  type PageTurnIntent,
} from "../page-gesture";
import styles from "./reader-page-interaction.module.css";

interface ReaderPageInteractionProps {
  /** Sumário aberto, erro ou fim do livro: nada vira página. */
  isBlocked: boolean;
  onNext(): void;
  onPrevious(): void;
  onOpenToc(): void;
  children: ReactNode;
}

interface PointerStart {
  x: number;
  y: number;
  pointerId: number;
}

export function ReaderPageInteraction({
  isBlocked,
  onNext,
  onPrevious,
  onOpenToc,
  children,
}: ReaderPageInteractionProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Só o botão principal inicia gesto; o direito abre menu do navegador.
      if (event.button !== 0) return;

      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    []
  );

  const handlePointerCancel = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  const runIntent = useCallback(
    (intent: PageTurnIntent) => {
      if (intent === "next") {
        onNext();
        return;
      }

      if (intent === "previous") {
        onPrevious();
        return;
      }

      if (intent === "open-toc") onOpenToc();
    },
    [onNext, onOpenToc, onPrevious]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerStart = pointerStartRef.current;
      pointerStartRef.current = null;

      // Up sem down guardado (outro botão, cancelado ou fora do palco) não vira.
      if (pointerStart === null) return;
      if (pointerStart.pointerId !== event.pointerId) return;
      if (isBlocked) return;

      // Seleção de texto com o mouse é do usuário, não da virada (EDGE-03).
      if (hasSelectedText()) return;

      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;

      const swipeDirection = PageGesture.resolveSwipe(dx, dy);
      if (swipeDirection !== null) {
        runIntent(swipeDirection);
        return;
      }

      const travel = Math.max(Math.abs(dx), Math.abs(dy));
      if (travel > TAP_MAX_TRAVEL_PX) return;

      const stage = stageRef.current;
      if (stage === null) return;

      const stageRect = stage.getBoundingClientRect();
      const tapX = event.clientX - stageRect.left;
      const tapIntent = PageGesture.resolveTap(tapX, stageRect.width);
      runIntent(tapIntent);
    },
    [isBlocked, runIntent]
  );

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </div>
  );
}

function hasSelectedText(): boolean {
  const selection = window.getSelection();
  if (selection === null) return false;

  const selectedText = selection.toString();
  return selectedText.length > 0;
}
