import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "../product";
import { BrandMark } from "./brand-mark";
import styles from "./app-shell.module.css";

interface AppShellProps {
  active?: "shelf";
  bookCount?: number;
  children: ReactNode;
}

export function AppShell({ active, bookCount, children }: AppShellProps) {
  const isShelfActive = active === "shelf";

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

          <span
            className={`${styles.navItem} ${styles.navItemMuted}`}
            title="Em breve"
          >
            Conversas
          </span>
          <span
            className={`${styles.navItem} ${styles.navItemMuted}`}
            title="Em breve"
          >
            Ajustes
          </span>
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
