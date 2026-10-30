import type { HighlightColor } from "./api";
import { HIGHLIGHT_COLORS } from "./api";

export interface HighlightColorOption {
  value: HighlightColor;
  label: string;
}

export const HIGHLIGHT_COLOR_OPTIONS: readonly HighlightColorOption[] =
  HIGHLIGHT_COLORS.map((color) => ({
    value: color,
    label: resolveHighlightColorLabel(color),
  }));

export function resolveHighlightColorLabel(color: HighlightColor): string {
  if (color === "yellow") return "Amarelo";
  if (color === "green") return "Verde";
  if (color === "blue") return "Azul";

  return "Rosa";
}
