"use client";

import { useCallback, useEffect, useRef } from "react";
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import styles from "./reader-scroll-pager.module.css";

const WHEEL_TURN_DELTA = 30;
const WHEEL_RESET_MS = 220;
const WHEEL_COOLDOWN_MS = 420;
const SWIPE_MIN_DY = 50;
const SWIPE_DOMINANCE = 1.2;
const LONG_PRESS_MS = 400;

interface ReaderScrollPagerProps {
  isBlocked: boolean;
  onNext(): void;
  onPrevious(): void;
  children: ReactNode;
}

interface PointerStart {
  x: number;
  y: number;
  pointerId: number;
  startedAt: number;
}

/**
 * Rolagem "virtual": o texto não rola de verdade. O gesto vertical (roda,
 * trackpad ou arrasto) vira uma página; a página nova entra de baixo/cima e a
 * anterior sai do DOM. Assim a tela continua do tamanho de uma página e o
 * leitor nunca carrega um trecho contínuo enorme.
 */
export function ReaderScrollPager({
  isBlocked,
  onNext,
  onPrevious,
  children,
}: ReaderScrollPagerProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastWheelTurnRef = useRef(0);

  const resetWheelAccumulator = useCallback(() => {
    wheelAccumulatorRef.current = 0;
    if (wheelResetTimerRef.current !== null) {
      clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = null;
    }
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (isBlocked || hasSelectedText()) return;
      // Shift+roda é gesto horizontal do navegador; Ctrl/Alt/Meta pertencem ao
      // zoom e ao sistema. Nenhum deles vira página.
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // O texto não tem rolagem nativa: a roda é só o gesto de virada.
      event.preventDefault();

      const now = Date.now();
      const isCoolingDown = now - lastWheelTurnRef.current < WHEEL_COOLDOWN_MS;
      if (isCoolingDown) return;

      wheelAccumulatorRef.current += event.deltaY;
      const hasEnoughDelta =
        Math.abs(wheelAccumulatorRef.current) >= WHEEL_TURN_DELTA;
      if (!hasEnoughDelta) {
        if (wheelResetTimerRef.current !== null) {
          clearTimeout(wheelResetTimerRef.current);
        }
        wheelResetTimerRef.current = setTimeout(resetWheelAccumulator, WHEEL_RESET_MS);
        return;
      }

      const scrollDirection = wheelAccumulatorRef.current > 0 ? 1 : -1;
      resetWheelAccumulator();
      lastWheelTurnRef.current = now;

      if (scrollDirection === 1) {
        onNext();
        return;
      }

      onPrevious();
    },
    [isBlocked, onNext, onPrevious, resetWheelAccumulator]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      if (wheelResetTimerRef.current !== null) {
        clearTimeout(wheelResetTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (hasSelectedText()) return;

      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        startedAt: Date.now(),
      };
    },
    []
  );

  const handlePointerCancel = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerStart = pointerStartRef.current;
      pointerStartRef.current = null;

      if (pointerStart === null) return;
      if (pointerStart.pointerId !== event.pointerId) return;
      if (isBlocked) return;

      // Seleção de texto (mouse ou toque longo) é do leitor, não da rolagem.
      if (hasSelectedText()) return;
      const pressDuration = Date.now() - pointerStart.startedAt;
      if (pressDuration >= LONG_PRESS_MS) return;

      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const isVertical = Math.abs(dy) > Math.abs(dx) * SWIPE_DOMINANCE;
      const isLongEnough = Math.abs(dy) >= SWIPE_MIN_DY;
      if (!isVertical || !isLongEnough) return;

      // Arrastar para cima puxa o que vem depois, como na rolagem.
      if (dy < 0) {
        onNext();
        return;
      }

      onPrevious();
    },
    [isBlocked, onNext, onPrevious]
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

  return selection.toString().length > 0;
}
