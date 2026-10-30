"use client";

import { useState } from "react";
import type { FormEvent, JSX } from "react";
import type { BookNote, NoteInput } from "./api";
import { NoteMarkdown } from "./note-markdown";
import styles from "./notes.module.css";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20_000;

interface NoteEditorProps {
  note: BookNote | null;
  defaultChapterPosition: number | null;
  isSaving: boolean;
  error: string | null;
  onSave(input: NoteInput): void;
  onCancel(): void;
}

export function NoteEditor({
  note,
  defaultChapterPosition,
  isSaving,
  error,
  onSave,
  onCancel,
}: NoteEditorProps): JSX.Element {
  const initialChapter = note?.chapterPosition ?? defaultChapterPosition ?? null;
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [chapter, setChapter] = useState(
    initialChapter === null ? "" : String(initialChapter)
  );
  const [isPreview, setIsPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length === 0) {
      setValidationError("Informe um título para a anotação.");
      return;
    }
    if (trimmedContent.length === 0) {
      setValidationError("Escreva o conteúdo da anotação.");
      return;
    }

    const trimmedChapter = chapter.trim();
    let chapterPosition: number | null = null;
    if (trimmedChapter.length > 0) {
      const parsedChapter = Number(trimmedChapter);
      const isValidChapter =
        Number.isInteger(parsedChapter) && parsedChapter >= 1;
      if (!isValidChapter) {
        setValidationError("O capítulo precisa ser um número inteiro maior que zero.");
        return;
      }
      chapterPosition = parsedChapter;
    }

    setValidationError(null);
    onSave({
      title: trimmedTitle,
      content: trimmedContent,
      chapterPosition,
    });
  };

  const handleTogglePreview = () => setIsPreview((current) => !current);
  const message = validationError ?? error;

  return (
    <form className={styles.editor} onSubmit={handleSubmit}>
      <h3 className={styles.editorTitle}>
        {note === null ? "Nova anotação" : "Editar anotação"}
      </h3>

      <label className={styles.field}>
        <span className={styles.label}>Título</span>
        <input
          type="text"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          className={styles.titleInput}
          placeholder="Ex.: Resumo do capítulo 3"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Capítulo (opcional)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={chapter}
          onChange={(event) => setChapter(event.target.value)}
          className={styles.chapterInput}
          placeholder="Ex.: 3"
        />
      </label>

      <div className={styles.editorBody}>
        <div className={styles.editorToolbar}>
          <span className={styles.label}>Conteúdo (markdown)</span>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleTogglePreview}
          >
            {isPreview ? "Editar" : "Prévia"}
          </button>
        </div>

        {isPreview ? (
          <div className={styles.preview}>
            <NoteMarkdown content={content} />
          </div>
        ) : (
          <textarea
            value={content}
            maxLength={MAX_CONTENT_LENGTH}
            onChange={(event) => setContent(event.target.value)}
            className={styles.textarea}
            placeholder={"Escreva em markdown…\n\n- ponto 1\n- ponto 2"}
          />
        )}
      </div>

      {message !== null && <p className={styles.error}>{message}</p>}

      <div className={styles.actionsRow}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isSaving}
        >
          {isSaving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
