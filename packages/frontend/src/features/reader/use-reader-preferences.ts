"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_THEME,
  FONT_SIZE_STEPS,
  FONT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  getNextFontSize,
  getNextTheme,
  getPreviousFontSize,
  resolveFontSize,
  resolveTheme,
} from "./reader-preferences";
import type { ReaderTheme } from "./reader-preferences";

const FIRST_FONT_SIZE = FONT_SIZE_STEPS[0];
const LAST_FONT_SIZE = FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];

export function useReaderPreferences() {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [theme, setTheme] = useState<ReaderTheme>(DEFAULT_THEME);

  // Lido só depois de montar: o HTML do servidor não conhece o localStorage,
  // então ler no estado inicial faria a primeira renderização divergir.
  useEffect(() => {
    const storedFontSize = readStorage(FONT_SIZE_STORAGE_KEY);
    const storedTheme = readStorage(THEME_STORAGE_KEY);
    const resolvedFontSize = resolveFontSize(storedFontSize);
    const resolvedTheme = resolveTheme(storedTheme);

    setFontSize(resolvedFontSize);
    setTheme(resolvedTheme);
  }, []);

  const increaseFont = useCallback(() => {
    const nextFontSize = getNextFontSize(fontSize);
    setFontSize(nextFontSize);
    writeStorage(FONT_SIZE_STORAGE_KEY, String(nextFontSize));
  }, [fontSize]);

  const decreaseFont = useCallback(() => {
    const previousFontSize = getPreviousFontSize(fontSize);
    setFontSize(previousFontSize);
    writeStorage(FONT_SIZE_STORAGE_KEY, String(previousFontSize));
  }, [fontSize]);

  const toggleTheme = useCallback(() => {
    const nextTheme = getNextTheme(theme);
    setTheme(nextTheme);
    writeStorage(THEME_STORAGE_KEY, nextTheme);
  }, [theme]);

  const canIncrease = fontSize < LAST_FONT_SIZE;
  const canDecrease = fontSize > FIRST_FONT_SIZE;

  return {
    fontSize,
    theme,
    canIncrease,
    canDecrease,
    increaseFont,
    decreaseFont,
    toggleTheme,
  };
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
