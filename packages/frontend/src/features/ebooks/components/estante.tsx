"use client";

import { useEffect, useState } from "react";
import { useEbooks } from "../use-ebooks";
import { useReprocessEbook } from "../use-reprocess-ebook";
import { EbookCard } from "./ebook-card";
import { EbookDetailPanel } from "./ebook-detail-panel";
import { UploadDropzone } from "./upload-dropzone";

const HIGHLIGHT_DURATION_MS = 4000;

const SHELF_TITLE = "Minha estante";
const SHELF_SUBTITLE = "Envie seus livros e acompanhe o processamento de cada um.";

const LOADING_LABEL = "Carregando estante...";
const EMPTY_LABEL = "Sua estante está vazia. Arraste o primeiro ebook para começar.";
const LOAD_ERROR_LABEL = "Não foi possível carregar a estante.";
const STALE_ERROR_LABEL = "Não foi possível atualizar agora. Tentando de novo...";
const RETRY_LABEL = "Tentar novamente";
const LOAD_MORE_LABEL = "Carregar mais";
const LOADING_MORE_LABEL = "Carregando...";

const ERROR_BANNER_CLASS_NAME =
  "rounded-md border border-red-300 bg-red-50 p-3";

const RETRY_BUTTON_CLASS_NAME =
  "mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50";

const LOAD_MORE_BUTTON_CLASS_NAME =
  "self-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60";

export function Estante() {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(
    null
  );

  const {
    ebooks,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useEbooks();

  const { reprocess, reprocessingId } = useReprocessEbook();

  // O destaque é passageiro: rola até o cartão da duplicata e o apaga depois,
  // para o aviso não ficar preso na tela.
  useEffect(() => {
    if (!highlightedBookId) return;

    const cardElementId = `ebook-card-${highlightedBookId}`;
    const cardElement = document.getElementById(cardElementId);
    cardElement?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timeoutId = window.setTimeout(() => {
      setHighlightedBookId(null);
    }, HIGHLIGHT_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedBookId]);

  const handleDuplicate = (existingBookId: string): void => {
    setHighlightedBookId(existingBookId);
  };

  const handleOpen = (bookId: string): void => {
    setSelectedBookId(bookId);
  };

  const handleClosePanel = (): void => {
    setSelectedBookId(null);
  };

  const handleLoadMore = (): void => {
    fetchNextPage();
  };

  const handleRetry = (): void => {
    refetch();
  };

  const isShelfEmpty = ebooks.length === 0;
  const isUpdateFailing = isError && !isShelfEmpty;

  const renderShelfList = () => (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {ebooks.map((ebook) => (
          <div id={`ebook-card-${ebook.id}`} key={ebook.id}>
            <EbookCard
              ebook={ebook}
              isHighlighted={ebook.id === highlightedBookId}
              isReprocessing={ebook.id === reprocessingId}
              onOpen={handleOpen}
              onReprocess={reprocess}
            />
          </div>
        ))}
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isFetchingNextPage}
          className={LOAD_MORE_BUTTON_CLASS_NAME}
        >
          {isFetchingNextPage ? LOADING_MORE_LABEL : LOAD_MORE_LABEL}
        </button>
      )}
    </section>
  );

  const renderShelf = () => {
    if (isLoading) {
      return (
        <p className="py-8 text-center text-sm text-neutral-600">
          {LOADING_LABEL}
        </p>
      );
    }

    if (isError && isShelfEmpty) {
      const errorMessage = error?.message;

      return (
        <div role="alert" className={ERROR_BANNER_CLASS_NAME}>
          <p className="text-sm font-medium text-red-800">{LOAD_ERROR_LABEL}</p>

          {errorMessage && (
            <p className="mt-1 text-xs text-red-700">{errorMessage}</p>
          )}

          <button
            type="button"
            onClick={handleRetry}
            className={RETRY_BUTTON_CLASS_NAME}
          >
            {RETRY_LABEL}
          </button>
        </div>
      );
    }

    if (isShelfEmpty) {
      return (
        <p className="py-8 text-center text-sm text-neutral-600">{EMPTY_LABEL}</p>
      );
    }

    return renderShelfList();
  };

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">{SHELF_TITLE}</h1>
        <p className="mt-1 text-sm text-neutral-500">{SHELF_SUBTITLE}</p>
      </header>

      <div className="mb-6">
        <UploadDropzone onDuplicate={handleDuplicate} />
      </div>

      {isUpdateFailing && (
        <p role="status" className="mb-3 text-xs text-neutral-500">
          {STALE_ERROR_LABEL}
        </p>
      )}

      {renderShelf()}

      {selectedBookId && (
        <EbookDetailPanel bookId={selectedBookId} onClose={handleClosePanel} />
      )}
    </main>
  );
}
