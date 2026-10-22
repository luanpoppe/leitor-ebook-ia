"use client";

import { useEbookFileDrop } from "../hooks/use-ebook-file-drop";
import { useShelf } from "../hooks/use-shelf";
import { AppShell } from "./app-shell";
import { BookDetailDialog } from "./book-detail-dialog";
import { BookGrid } from "./book-grid";
import { LeadCard } from "./lead-card";
import { ShelfHeader } from "./shelf-header";
import { ShelfRail } from "./shelf-rail";
import { StatsStrip } from "./stats-strip";
import styles from "./shelf-page.module.css";

export function ShelfPage() {
  const shelf = useShelf();
  const drop = useEbookFileDrop({ onDuplicate: shelf.handleDuplicate });

  const { stats, ebooks } = shelf;
  const leadBook =
    ebooks.find((ebook) => ebook.status === "ready") ?? ebooks[0] ?? null;

  return (
    <AppShell
      active="shelf"
      bookCount={shelf.isLoading ? undefined : stats.total}
    >
      <ShelfHeader
        stats={stats}
        isLoading={shelf.isLoading}
        onRefresh={shelf.refetch}
        onUpload={drop.openPicker}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          {leadBook && (
            <LeadCard ebook={leadBook} onOpen={shelf.openBook} />
          )}

          <StatsStrip stats={stats} isLoading={shelf.isLoading} />

          {shelf.isError && ebooks.length > 0 && (
            <p role="status" className={styles.stale}>
              Não foi possível atualizar agora. A estante pode estar
              desatualizada.
            </p>
          )}

          <section aria-labelledby="shelf-books-title">
            <header className={styles.sectionHeader}>
              <h2 id="shelf-books-title" className={styles.sectionTitle}>
                Todos os livros
              </h2>
              <span className={styles.sectionCount}>
                {stats.total} {stats.total === 1 ? "título" : "títulos"}
              </span>
            </header>

            <BookGrid
              ebooks={ebooks}
              isLoading={shelf.isLoading}
              isError={shelf.isError}
              errorMessage={shelf.errorMessage}
              highlightedId={shelf.highlightedId}
              isReprocessingFor={shelf.isReprocessingFor}
              onRetry={shelf.refetch}
              onOpen={shelf.openBook}
              onReprocess={shelf.reprocess}
              onUpload={drop.openPicker}
              hasNextPage={shelf.hasNextPage}
              onLoadMore={shelf.fetchNextPage}
              isFetchingNextPage={shelf.isFetchingNextPage}
            />
          </section>
        </div>

        <ShelfRail ebooks={ebooks} drop={drop} onOpen={shelf.openBook} />
      </div>

      {shelf.selectedId && (
        <BookDetailDialog
          bookId={shelf.selectedId}
          onClose={shelf.closeBook}
          onReprocess={shelf.reprocess}
          isReprocessing={shelf.isReprocessingFor(shelf.selectedId)}
        />
      )}
    </AppShell>
  );
}
