import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "../product";
import { BrandMark } from "./brand-mark";
import styles from "./app-shell.module.css";

interface AppShellProps {
  active?: "shelf" | "notes" | "conversations" | "settings";
  bookCount?: number;
  children: ReactNode;
}

export function AppShell({ active, bookCount, children }: AppShellProps) {
  const isShelfActive = active === "shelf";
  const isNotesActive = active === "notes";
  const isConversationsActive = active === "conversations";
  const isSettingsActive = active === "settings";

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} title={`${PRODUCT_NAME} · estante`}>
          <BrandMark className={styles.brandMark} />
          {PRODUCT_NAME}
        </Link>

        <div className={styles.scope}>
          <span className={styles.scopeName}>Biblioteca pessoal</span>
          {bookCount !== undefined && (
            <span className={styles.scopeMeta}>
              {bookCount} {bookCount === 1 ? "livro" : "livros"}
            </span>
          )}
        </div>

        <nav className={styles.nav} aria-label="Navegação principal">
          <span className={styles.navLabel}>Leitura</span>

          <Link
            href="/"
            className={`${styles.navItem} ${
              isShelfActive ? styles.navItemActive : ""
            }`}
            aria-current={isShelfActive ? "page" : undefined}
          >
            Estante
            {bookCount !== undefined && (
              <span className={styles.navCount}>{bookCount}</span>
            )}
          </Link>

          <Link
            href="/anotacoes"
            className={`${styles.navItem} ${
              isNotesActive ? styles.navItemActive : ""
            }`}
            aria-current={isNotesActive ? "page" : undefined}
          >
            Anotações
          </Link>

          <span className={styles.navLabel}>Mais</span>

          <Link
            href="/conversas"
            className={`${styles.navItem} ${
              isConversationsActive ? styles.navItemActive : ""
            }`}
            aria-current={isConversationsActive ? "page" : undefined}
          >
            Conversas
          </Link>

          <Link
            href="/ajustes"
            className={`${styles.navItem} ${
              isSettingsActive ? styles.navItemActive : ""
            }`}
            aria-current={isSettingsActive ? "page" : undefined}
          >
            Ajustes
          </Link>
        </nav>

        <div className={styles.sidebarFoot}>
          <span className={styles.footerNote}>{PRODUCT_TAGLINE}</span>
        </div>
      </aside>

      <div className={styles.canvas}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
