"use client";

import type { JSX } from "react";
import type { HighlightColor } from "../api";
import { HIGHLIGHT_COLOR_OPTIONS } from "../highlight-colors";
import styles from "./highlight-color-picker.module.css";

interface HighlightColorPickerProps {
  onSelect(color: HighlightColor): void;
  disabled?: boolean;
  /** No menu flutuante o rótulo ajuda; na barra compacta pode ser omitido. */
  showLabel?: boolean;
  /** Prefixo do rótulo acessível: "Marcar em" ao criar, "Mudar para" ao trocar. */
  actionLabel?: string;
}

/** Quatro tons claros para marcar o trecho selecionado. */
export function HighlightColorPicker({
  onSelect,
  disabled = false,
  showLabel = true,
  actionLabel = "Marcar em",
}: HighlightColorPickerProps): JSX.Element {
  return (
    <div className={styles.picker} role="group" aria-label="Cor da marcação">
      {showLabel && <span className={styles.label}>Marcar</span>}

      {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          data-color={option.value}
          onClick={() => onSelect(option.value)}
          disabled={disabled}
          aria-label={`${actionLabel} ${option.label.toLowerCase()}`}
          title={`${actionLabel} ${option.label.toLowerCase()}`}
        />
      ))}
    </div>
  );
}
