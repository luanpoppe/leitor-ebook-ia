export type ReaderTheme = "light" | "sepia";
export type ReaderMode = "page" | "scroll";

export const FONT_SIZE_STEPS = [16, 18, 20, 22, 24] as const;

export const DEFAULT_FONT_SIZE = 18;
export const DEFAULT_THEME: ReaderTheme = "light";
export const DEFAULT_READER_MODE: ReaderMode = "page";

export const FONT_SIZE_STORAGE_KEY = "folio.reader.font-size";
export const THEME_STORAGE_KEY = "folio.reader.theme";
export const READER_MODE_STORAGE_KEY = "reader-mode";

const LAST_FONT_SIZE_INDEX = FONT_SIZE_STEPS.length - 1;

export function resolveFontSize(raw: string | null): number {
  if (raw === null) return DEFAULT_FONT_SIZE;

  const parsedFontSize = Number(raw);
  const isKnownStep = FONT_SIZE_STEPS.some((step) => step === parsedFontSize);
  if (!isKnownStep) return DEFAULT_FONT_SIZE;

  return parsedFontSize;
}

export function resolveTheme(raw: string | null): ReaderTheme {
  if (raw === "sepia") return "sepia";

  return DEFAULT_THEME;
}

export function getNextFontSize(current: number): number {
  const currentIndex = FONT_SIZE_STEPS.indexOf(
    current as (typeof FONT_SIZE_STEPS)[number]
  );
  if (currentIndex === -1) return DEFAULT_FONT_SIZE;

  const candidateIndex = currentIndex + 1;
  const nextIndex = Math.min(candidateIndex, LAST_FONT_SIZE_INDEX);
  return FONT_SIZE_STEPS[nextIndex];
}

export function getPreviousFontSize(current: number): number {
  const currentIndex = FONT_SIZE_STEPS.indexOf(
    current as (typeof FONT_SIZE_STEPS)[number]
  );
  if (currentIndex === -1) return DEFAULT_FONT_SIZE;

  const candidateIndex = currentIndex - 1;
  const previousIndex = Math.max(candidateIndex, 0);
  return FONT_SIZE_STEPS[previousIndex];
}

export function getNextTheme(current: ReaderTheme): ReaderTheme {
  if (current === "light") return "sepia";

  return "light";
}

/** Resolve o valor guardado; qualquer coisa fora de page/scroll cai no padrão. */
export function resolveReaderMode(rawValue: string | null): ReaderMode {
  if (rawValue === "page") return "page";
  if (rawValue === "scroll") return "scroll";

  return DEFAULT_READER_MODE;
}

export function toggleReaderMode(mode: ReaderMode): ReaderMode {
  if (mode === "page") return "scroll";

  return "page";
}
