"use client";

import Link from "next/link";
import type { EbookStatus } from "@/features/ebooks/types";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useReprocessEbook } from "@/features/ebooks/use-reprocess-ebook";
import { AppShell } from "./app-shell";
import { BookCover } from "./book-cover";
import { DetailFacts } from "./detail-facts";
import { StatusMark } from "./status-mark";
import styles from "./detail.module.css";

interface BookDetailPageProps {
  bookId: string;
}

const BACK_LABEL = "Voltar para a estante";
const NOT_FOUND_TITLE = "Ebook não encontrado.";
const NOT_FOUND_HINT =
  "O link pode estar incorreto ou o ebook foi removido da estante.";
const GENERIC_ERROR_LABEL = "Não foi possível carregar o ebook.";

const PREPARATION_COPY: Record<EbookStatus, string> = {
  pending:
    "O arquivo foi recebido e aguarda a vez na fila de preparo. A página atualiza sozinha quando a ingestão começar.",
  processing:
    "O texto está sendo extraído e transformado em trechos vetorizados. Ao terminar, o livro fica pronto para abrir.",
  ready:
    "O texto foi extraído, dividido em trechos e vetorizado. O livro está pronto para abrir e conversar.",
  failed:
    "A preparação parou antes do fim. O motivo está logo abaixo; uma nova tentativa recoloca o livro na fila.",
};

export function BookDetailPage({ bookId }: BookDetailPageProps) {
  const { ebook, isLoading, notFound, errorMessage, refetch } =
    useEbookDetail(bookId);
  const { reprocess, isReprocessingFor } = useReprocessEbook();

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className={styles.page} aria-busy="true">
          <div className={styles.spread}>
            <div className={styles.skeletonCover} />
            <div className={styles.skeletonInfo}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          </div>
        </div>
      );
    }

    if (notFound) {
      return (
        <div className={styles.page}>
          <div>
            <h1 className={styles.notFoundTitle}>{NOT_FOUND_TITLE}</h1>
            <p className={styles.notFoundHint}>{NOT_FOUND_HINT}</p>
            <Link href="/" className={styles.secondaryButton}>
              {BACK_LABEL}
            </Link>
          </div>
        </div>
      );
    }

    if (!ebook) {
      return (
        <div className={styles.page}>
          <div>
            <p className={styles.errorText}>
              {errorMessage ?? GENERIC_ERROR_LABEL}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className={styles.secondaryButton}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    const isFailed = ebook.status === "failed";
    const isReady = ebook.status === "ready";
    const isReprocessing = isReprocessingFor(ebook.id);
    const readingHref = `/ebooks/${ebook.id}/ler`;

    return (
      <article className={styles.page}>
        <div className={styles.spread}>
          <div className={styles.coverColumn}>
            <BookCover
              title={ebook.title}
              coverUrl={ebook.coverUrl}
              format={ebook.format}
              variant="detail"
            />

            <Link href="/" className={styles.secondaryButton}>
              {BACK_LABEL}
            </Link>
          </div>

          <div className={styles.infoColumn}>
            <p className={styles.kicker}>Na sua estante</p>
            <h1 className={styles.title}>{ebook.title}</h1>
            {ebook.author && <p className={styles.author}>{ebook.author}</p>}

            <p className={styles.statusRow}>
              <StatusMark status={ebook.status} variant="pill" />
            </p>

            {isReady && (
              <div>
                <Link
                  href={readingHref}
                  className={`${styles.primaryButton} ${styles.readAction}`}
                  aria-label="Ler este livro"
                >
                  Ler
                </Link>
              </div>
            )}

            <div className={styles.panels}>
              <section
                className={styles.panel}
                aria-labelledby="book-preparation-title"
              >
                <h2
                  id="book-preparation-title"
                  className={styles.panelTitle}
                >
                  Preparação
                </h2>

                <p className={styles.stageText}>
                  {PREPARATION_COPY[ebook.status]}
                </p>

                {ebook.errorMessage && (
                  <p className={styles.errorBox}>{ebook.errorMessage}</p>
                )}

                {isFailed && (
                  <button
                    type="button"
                    onClick={() => reprocess(ebook.id)}
                    disabled={isReprocessing}
                    className={styles.primaryButton}
                  >
                    {isReprocessing ? "Enviando..." : "Tentar de novo"}
                  </button>
                )}
              </section>

              <section className={styles.panel} aria-labelledby="book-facts-title">
                <h2 id="book-facts-title" className={styles.panelTitle}>
                  Ficha do livro
                </h2>

                <DetailFacts ebook={ebook} />
              </section>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return <AppShell>{renderBody()}</AppShell>;
}
