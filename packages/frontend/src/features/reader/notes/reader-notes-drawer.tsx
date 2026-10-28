"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useDialogPanel } from "@/features/shelf/hooks/use-dialog-panel";
import { getApiErrorInfo } from "@/features/ebooks/api";
import type { BookNote, NoteInput } from "./api";
import { NoteDetail } from "./note-detail";
import { NoteEditor } from "./note-editor";
import { NoteList } from "./note-list";
import { useNotes } from "./use-notes";
import styles from "./notes.module.css";

interface ReaderNotesDrawerProps {
  bookId: string;
  currentChapterPosition: number | null;
  /** Abre direto nesta anotação (ex.: botão "Abrir anotação" do chat). */
  initialNoteId: string | null;
  onClose(): void;
  onGoToChapter(position: number): void;
}

type NotesView =
  | { kind: "list" }
  | { kind: "detail"; note: BookNote }
  | { kind: "editor"; note: BookNote | null };

/**
 * Anotações do livro: lista, leitura renderizada em markdown e editor. A IA
 * cria/edita pelas ferramentas do chat; ao abrir o painel os dados vêm frescos.
 */
export function ReaderNotesDrawer({
  bookId,
  currentChapterPosition,
  initialNoteId,
  onClose,
  onGoToChapter,
}: ReaderNotesDrawerProps): JSX.Element {
  const { notes, isLoading, error, reload, create, update, remove } =
    useNotes(bookId);
  const { dialogRef, closeButtonRef, handleKeyDown } = useDialogPanel(onClose);
  const [view, setView] = useState<NotesView>({ kind: "list" });
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const appliedInitialNoteRef = useRef(false);

  useEffect(() => {
    if (initialNoteId === null || appliedInitialNoteRef.current) return;
    if (isLoading) return;

    appliedInitialNoteRef.current = true;
    const initialNote = notes.find((note) => note.id === initialNoteId);
    if (initialNote === undefined) {
      setActionError("Anotação não encontrada. Ela pode ter sido excluída.");
      return;
    }

    setView({ kind: "detail", note: initialNote });
  }, [initialNoteId, isLoading, notes]);

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    if (normalizedQuery.length === 0) return notes;

    return notes.filter((note) => {
      const title = note.title.toLocaleLowerCase("pt-BR");
      const content = note.content.toLocaleLowerCase("pt-BR");

      return (
        title.includes(normalizedQuery) || content.includes(normalizedQuery)
      );
    });
  }, [notes, query]);

  const goToList = useCallback(() => {
    setActionError(null);
    setView({ kind: "list" });
  }, []);

  const openNewNote = useCallback(() => {
    setActionError(null);
    setView({ kind: "editor", note: null });
  }, []);

  const openNote = useCallback((note: BookNote) => {
    setActionError(null);
    setView({ kind: "detail", note });
  }, []);

  const editNote = useCallback((note: BookNote) => {
    setActionError(null);
    setView({ kind: "editor", note });
  }, []);

  const handleSave = useCallback(
    async (input: NoteInput) => {
      if (view.kind !== "editor") return;

      setIsSaving(true);
      setActionError(null);

      try {
        const savedNote =
          view.note === null
            ? await create(input)
            : await update(view.note.id, input);
        setView({ kind: "detail", note: savedNote });
      } catch (cause) {
        setActionError(getApiErrorInfo(cause).message);
      } finally {
        setIsSaving(false);
      }
    },
    [create, update, view]
  );

  const handleDelete = useCallback(
    async (note: BookNote) => {
      setIsDeleting(true);
      setActionError(null);

      try {
        await remove(note.id);
        setView({ kind: "list" });
      } catch (cause) {
        setActionError(getApiErrorInfo(cause).message);
      } finally {
        setIsDeleting(false);
      }
    },
    [remove]
  );

  return (
    <div className={styles.layer}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      <section
        className={styles.panel}
        role="dialog"
        aria-label="Anotações do livro"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Anotações</h2>

          <div className={styles.headerActions}>
            {view.kind === "list" && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openNewNote}
              >
                Nova
              </button>
            )}
            {view.kind === "detail" && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={goToList}
              >
                Voltar
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeButton}
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {view.kind === "list" && (
            <>
              {notes.length > 0 && (
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={styles.searchInput}
                  placeholder="Buscar nas anotações…"
                  aria-label="Buscar nas anotações"
                />
              )}

              {actionError !== null && (
                <p className={styles.error}>{actionError}</p>
              )}

              {isLoading && <p className={styles.status}>Carregando…</p>}

              {!isLoading && error !== null && (
                <div className={styles.statusBox}>
                  <p className={styles.error}>{error}</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={reload}
                  >
                    Tentar de novo
                  </button>
                </div>
              )}

              {!isLoading && error === null && notes.length === 0 && (
                <p className={styles.status}>
                  Nenhuma anotação ainda. Crie uma ou peça à IA no chat.
                </p>
              )}

              {!isLoading &&
                error === null &&
                notes.length > 0 &&
                filteredNotes.length === 0 && (
                  <p className={styles.status}>
                    Nenhuma anotação encontrada para “{query.trim()}”.
                  </p>
                )}

              {filteredNotes.length > 0 && (
                <NoteList notes={filteredNotes} onSelect={openNote} />
              )}
            </>
          )}

          {view.kind === "detail" && (
            <NoteDetail
              note={view.note}
              isDeleting={isDeleting}
              error={actionError}
              onEdit={() => editNote(view.note)}
              onDelete={() => void handleDelete(view.note)}
              onGoToChapter={onGoToChapter}
            />
          )}

          {view.kind === "editor" && (
            <NoteEditor
              key={view.note?.id ?? "new"}
              note={view.note}
              defaultChapterPosition={currentChapterPosition}
              isSaving={isSaving}
              error={actionError}
              onSave={(input) => void handleSave(input)}
              onCancel={() => {
                if (view.note === null) {
                  goToList();
                  return;
                }
                openNote(view.note);
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
