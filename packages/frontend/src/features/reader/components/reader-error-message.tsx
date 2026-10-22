"use client";

import Link from "next/link";
import type { JSX } from "react";
import type { ReaderErrorKind } from "../use-reader";
import { ReaderMessage } from "./reader-message";
import styles from "./reader-message.module.css";

interface ReaderErrorMessageProps {
  errorKind: ReaderErrorKind;
  backHref: string;
  onRetry: () => void;
  onOpenFirstChapter: () => void;
}

export function ReaderErrorMessage({
  errorKind,
  backHref,
  onRetry,
  onOpenFirstChapter,
}: ReaderErrorMessageProps): JSX.Element {
  if (errorKind === "book-not-found") {
    return (
      <ReaderMessage
        title="Livro não encontrado"
        description="Ele pode ter sido removido da estante."
      >
        <Link href="/" className={styles.secondaryAction}>
          Voltar à estante
        </Link>
      </ReaderMessage>
    );
  }

  if (errorKind === "not-ready") {
    return (
      <ReaderMessage
        title="Este livro ainda está sendo preparado"
        description="A leitura abre assim que a preparação terminar."
      >
        <button
          type="button"
          onClick={onRetry}
          className={styles.primaryAction}
        >
          Tentar de novo
        </button>
        <Link href={backHref} className={styles.secondaryAction}>
          Voltar à ficha
        </Link>
      </ReaderMessage>
    );
  }

  if (errorKind === "chapter-not-found") {
    return (
      <ReaderMessage
        title="Este capítulo não existe mais"
        description="O livro pode ter sido reprocessado com outro número de capítulos."
      >
        <button
          type="button"
          onClick={onOpenFirstChapter}
          className={styles.primaryAction}
        >
          Abrir o primeiro capítulo
        </button>
        <Link href={backHref} className={styles.secondaryAction}>
          Voltar à ficha
        </Link>
      </ReaderMessage>
    );
  }

  return (
    <ReaderMessage
      title="Não foi possível carregar a leitura"
      description="Verifique a conexão e tente de novo."
    >
      <button type="button" onClick={onRetry} className={styles.primaryAction}>
        Tentar de novo
      </button>
      <Link href={backHref} className={styles.secondaryAction}>
        Voltar à ficha
      </Link>
    </ReaderMessage>
  );
}
