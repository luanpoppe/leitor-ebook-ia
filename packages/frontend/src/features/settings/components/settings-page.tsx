"use client";

import type { JSX } from "react";
import { AppShell } from "@/features/shelf/components/app-shell";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/features/shelf/product";
import type {
  ReaderAlignment,
  ReaderMode,
  ReaderTheme,
} from "@/features/reader/reader-preferences";
import { useReaderMode } from "@/features/reader/use-reader-mode";
import { useReaderPreferences } from "@/features/reader/use-reader-preferences";
import styles from "./settings-page.module.css";

export function SettingsPage(): JSX.Element {
  const {
    fontSize,
    theme,
    alignment,
    canIncrease,
    canDecrease,
    increaseFont,
    decreaseFont,
    toggleTheme,
    toggleAlignment,
  } = useReaderPreferences();
  const { mode, setMode } = useReaderMode();

  const selectTheme = (nextTheme: ReaderTheme) => {
    if (theme !== nextTheme) toggleTheme();
  };

  const selectAlignment = (nextAlignment: ReaderAlignment) => {
    if (alignment !== nextAlignment) toggleAlignment();
  };

  const selectMode = (nextMode: ReaderMode) => {
    setMode(nextMode);
  };

  return (
    <AppShell active="settings">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca pessoal</p>
          <h1 className={styles.title}>Ajustes</h1>
          <p className={styles.subtitle}>
            Preferências de leitura salvas neste navegador.
          </p>
        </div>
      </header>

      <section className={styles.card} aria-labelledby="reading-settings-title">
        <h2 id="reading-settings-title" className={styles.cardTitle}>
          Leitura
        </h2>

        <div className={styles.row}>
          <div className={styles.rowLabel}>
            <span className={styles.label}>Tema</span>
            <span className={styles.hint}>Fundo da página de leitura.</span>
          </div>
          <div className={styles.segments}>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={theme === "light"}
              onClick={() => selectTheme("light")}
            >
              Claro
            </button>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={theme === "sepia"}
              onClick={() => selectTheme("sepia")}
            >
              Sépia
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>
            <span className={styles.label}>Tamanho da fonte</span>
            <span className={styles.hint}>Vale para os dois modos.</span>
          </div>
          <div className={styles.fontControls}>
            <button
              type="button"
              className={styles.stepper}
              onClick={decreaseFont}
              disabled={!canDecrease}
              aria-label="Diminuir fonte"
            >
              A−
            </button>
            <span className={styles.fontValue}>{fontSize}px</span>
            <button
              type="button"
              className={styles.stepper}
              onClick={increaseFont}
              disabled={!canIncrease}
              aria-label="Aumentar fonte"
            >
              A+
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>
            <span className={styles.label}>Alinhamento</span>
            <span className={styles.hint}>Como as linhas do texto se alinham.</span>
          </div>
          <div className={styles.segments}>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={alignment === "left"}
              onClick={() => selectAlignment("left")}
            >
              Esquerda
            </button>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={alignment === "justify"}
              onClick={() => selectAlignment("justify")}
            >
              Justificado
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>
            <span className={styles.label}>Modo de leitura</span>
            <span className={styles.hint}>
              Página vira por toque; rolagem usa o gesto contínuo.
            </span>
          </div>
          <div className={styles.segments}>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={mode === "page"}
              onClick={() => selectMode("page")}
            >
              Página
            </button>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={mode === "scroll"}
              onClick={() => selectMode("scroll")}
            >
              Rolagem
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="about-settings-title">
        <h2 id="about-settings-title" className={styles.cardTitle}>
          Sobre
        </h2>
        <p className={styles.aboutText}>
          <strong>{PRODUCT_NAME}</strong> — {PRODUCT_TAGLINE}
        </p>
        <p className={styles.aboutHint}>
          As preferências ficam no armazenamento local deste navegador; não são
          sincronizadas entre dispositivos.
        </p>
      </section>
    </AppShell>
  );
}
