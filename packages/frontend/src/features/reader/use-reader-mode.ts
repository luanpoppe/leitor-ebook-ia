"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_READER_MODE,
  READER_MODE_STORAGE_KEY,
  resolveReaderMode,
  toggleReaderMode,
} from "./reader-preferences";
import type { ReaderMode } from "./reader-preferences";

export function useReaderMode(): {
  mode: ReaderMode;
  setMode(nextMode: ReaderMode): void;
  toggleMode(): void;
} {
  const [mode, setModeState] = useState<ReaderMode>(DEFAULT_READER_MODE);

  // Lido só depois de montar: o HTML do servidor não conhece o localStorage,
  // então ler no estado inicial faria a primeira renderização divergir.
  useEffect(() => {
    const storedMode = readStorage(READER_MODE_STORAGE_KEY);
    const resolvedMode = resolveReaderMode(storedMode);

    setModeState(resolvedMode);
  }, []);

  const setMode = useCallback((nextMode: ReaderMode) => {
    setModeState(nextMode);
    writeStorage(READER_MODE_STORAGE_KEY, nextMode);
  }, []);

  const toggleMode = useCallback(() => {
    const nextMode = toggleReaderMode(mode);
    setModeState(nextMode);
    writeStorage(READER_MODE_STORAGE_KEY, nextMode);
  }, [mode]);

  return { mode, setMode, toggleMode };
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Modo privado ou storage bloqueado: a preferência vale só nesta sessão.
  }
}
