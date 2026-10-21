"use client";

import { formatDate, formatExtension } from "../format";
import type { EbookSummary } from "../types";
import { useEbookDetail } from "../use-ebook-detail";
import { EbookCover } from "./ebook-cover";
import { EbookStatusBadge } from "./ebook-status-badge";

interface EbookCardProps {
  ebook: EbookSummary;
  isHighlighted?: boolean;
  isReprocessing?: boolean;
  onOpen: (id: string) => void;
  onReprocess: (id: string) => void;
}

interface EbookErrorMessageProps {
  bookId: string;
}

const CARD_BASE_CLASS_NAME = "rounded-lg border p-3";

const CARD_HIGHLIGHTED_CLASS_NAME = "ring-2 ring-amber-400 border-amber-300";

const OPEN_BUTTON_CLASS_NAME =
  "flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2";

const REPROCESS_BUTTON_CLASS_NAME =
  "mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

export function EbookCard({
  ebook,
  isHighlighted = false,
  isReprocessing = false,
  onOpen,
  onReprocess,
}: EbookCardProps) {
  const isFailed = ebook.status === "failed";

  const cardClassNames = [
    CARD_BASE_CLASS_NAME,
    isHighlighted ? CARD_HIGHLIGHTED_CLASS_NAME : null,
  ]
    .filter(Boolean)
    .join(" ");

  const handleOpen = () => onOpen(ebook.id);
  const handleReprocess = () => onReprocess(ebook.id);

  return (
    <article className={cardClassNames}>
      <button
        type="button"
        onClick={handleOpen}
        className={OPEN_BUTTON_CLASS_NAME}
      >
        {/* A listagem já traz a capa pré-assinada; quando `coverUrl` é null
            (sem capa ou storage fora), o placeholder com o título assume. */}
        <div className="w-20 shrink-0">
          <EbookCover title={ebook.title} coverUrl={ebook.coverUrl} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-neutral-900">
            {ebook.title}
          </h3>

          {ebook.author && (
            <p className="truncate text-xs text-neutral-600">{ebook.author}</p>
          )}

          <p className="mt-1 text-xs text-neutral-500">
            {formatExtension(ebook.format)} · {formatDate(ebook.createdAt)}
          </p>

          <EbookStatusBadge status={ebook.status} className="mt-2 inline-block" />
        </div>
      </button>

      {isFailed && (
        <div className="border-t border-neutral-200 pt-2">
          <EbookErrorMessage bookId={ebook.id} />

          <button
            type="button"
            onClick={handleReprocess}
            disabled={isReprocessing}
            className={REPROCESS_BUTTON_CLASS_NAME}
          >
            {isReprocessing ? "Tentando..." : "Tentar de novo"}
          </button>
        </div>
      )}
    </article>
  );
}

// Hook não pode ser chamado condicionalmente, então a busca do detalhe (única
// fonte de `errorMessage`) mora neste componente renderizado só em `failed`.
function EbookErrorMessage({ bookId }: EbookErrorMessageProps) {
  const { ebook } = useEbookDetail(bookId);
  const errorMessage = ebook?.errorMessage;

  if (!errorMessage) return null;

  return <p className="mt-2 text-xs text-red-700 line-clamp-2">{errorMessage}</p>;
}
