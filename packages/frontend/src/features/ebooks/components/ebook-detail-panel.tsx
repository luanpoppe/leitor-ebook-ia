"use client";

import { useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { formatBytes, formatDate, formatExtension } from "../format";
import type { EbookDetail } from "../types";
import { useEbookDetail } from "../use-ebook-detail";
import { EbookCover } from "./ebook-cover";
import { EbookStatusBadge } from "./ebook-status-badge";

interface EbookDetailPanelProps {
  bookId: string;
  onClose: () => void;
}

const TITLE_ELEMENT_ID = "ebook-detail-panel-title";

const LOADING_LABEL = "Carregando ebook...";
const NOT_FOUND_LABEL = "Ebook não encontrado.";
const GENERIC_ERROR_LABEL = "Não foi possível carregar o ebook.";

const OVERLAY_CLASS_NAME =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";

const PANEL_CLASS_NAME =
  "max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl";

const CLOSE_BUTTON_CLASS_NAME =
  "rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

const RETRY_BUTTON_CLASS_NAME =
  "mt-2 rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50";

export function EbookDetailPanel({ bookId, onClose }: EbookDetailPanelProps) {
  // O hook roda sempre (regra dos hooks); sem id ele não busca nada.
  const { ebook, isLoading, isError, notFound, error, refetch } =
    useEbookDetail(bookId);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasBookId = bookId.trim().length > 0;
  if (!hasBookId) return null;

  const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <p className="py-8 text-center text-sm text-neutral-600">
          {LOADING_LABEL}
        </p>
      );
    }

    if (notFound) {
      return (
        <p className="py-8 text-center text-sm text-neutral-600">
          {NOT_FOUND_LABEL}
        </p>
      );
    }

    if (isError) {
      const errorMessage = error?.message ?? GENERIC_ERROR_LABEL;

      return (
        <div className="py-8 text-center">
          <p className="text-sm text-red-700">{errorMessage}</p>

          <button
            type="button"
            onClick={() => refetch()}
            className={RETRY_BUTTON_CLASS_NAME}
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    if (!ebook) return null;

    return renderDetailContent(ebook);
  };

  return (
    <div className={OVERLAY_CLASS_NAME} onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ELEMENT_ID}
        className={PANEL_CLASS_NAME}
        onClick={handleContentClick}
      >
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className={CLOSE_BUTTON_CLASS_NAME}
          >
            Fechar
          </button>
        </div>

        <h2 id={TITLE_ELEMENT_ID} className="sr-only">
          Detalhes do ebook
        </h2>

        {renderBody()}
      </div>
    </div>
  );
}

// Renderização do caso de sucesso, separada para o corpo do painel não virar
// uma função com loading, erro e detalhe misturados.
function renderDetailContent(ebook: EbookDetail) {
  const sizeLabel = formatBytes(ebook.size);
  const formatLabel = formatExtension(ebook.format);
  const createdAtLabel = formatDate(ebook.createdAt);

  return (
    <div className="mt-2 flex flex-col gap-4 sm:flex-row">
      <div className="w-32 shrink-0">
        <EbookCover title={ebook.title} coverUrl={ebook.coverUrl} />
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-neutral-900">
          {ebook.title}
        </h2>

        {ebook.author && (
          <p className="text-sm text-neutral-600">{ebook.author}</p>
        )}

        <EbookStatusBadge status={ebook.status} className="mt-2 inline-block" />

        <p className="mt-3 text-sm text-neutral-700">
          {formatLabel} · {sizeLabel}
        </p>

        <p className="text-sm text-neutral-500">Enviado em {createdAtLabel}</p>

        {ebook.errorMessage && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
            {ebook.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
