"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EbookCover } from "@/features/ebooks/components/ebook-cover";
import { EbookStatusBadge } from "@/features/ebooks/components/ebook-status-badge";
import {
  formatBytes,
  formatDate,
  formatExtension,
} from "@/features/ebooks/format";
import type { EbookDetail } from "@/features/ebooks/types";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";

const LOADING_LABEL = "Carregando ebook...";
const NOT_FOUND_TITLE = "Ebook não encontrado.";
const NOT_FOUND_HINT =
  "O link pode estar incorreto ou o ebook foi removido da estante.";
const GENERIC_ERROR_LABEL = "Não foi possível carregar o ebook.";
const BACK_TO_SHELF_LABEL = "← Voltar para a estante";

const BACK_LINK_CLASS_NAME =
  "inline-block text-sm font-medium text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

const RETRY_BUTTON_CLASS_NAME =
  "mt-3 rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50";

type RouteParams = { id: string | string[] };

export default function EbookPage() {
  const params = useParams<RouteParams>();
  const bookId = resolveBookId(params?.id);

  const { ebook, isLoading, isError, notFound, error, refetch } =
    useEbookDetail(bookId);

  const renderBody = () => {
    if (!bookId) return <NotFoundState />;

    if (isLoading) {
      return (
        <p className="mt-6 text-sm text-neutral-600">{LOADING_LABEL}</p>
      );
    }

    if (notFound) return <NotFoundState />;

    if (isError) {
      const errorMessage = error?.message ?? GENERIC_ERROR_LABEL;

      return (
        <div className="mt-6">
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
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/" className={BACK_LINK_CLASS_NAME}>
        {BACK_TO_SHELF_LABEL}
      </Link>

      {renderBody()}
    </main>
  );
}

// A rota pode chegar como ausente ou como lista (catch-all); a página só usa
// o primeiro segmento e trata vazio como "não encontrado".
function resolveBookId(rawId: string | string[] | undefined): string {
  if (Array.isArray(rawId)) {
    const [firstId] = rawId;
    return firstId?.trim() ?? "";
  }

  return rawId?.trim() ?? "";
}

function NotFoundState() {
  return (
    <div className="mt-6">
      <h1 className="text-xl font-semibold text-neutral-900">
        {NOT_FOUND_TITLE}
      </h1>

      <p className="mt-2 text-sm text-neutral-600">{NOT_FOUND_HINT}</p>

      <Link
        href="/"
        className="mt-4 inline-block text-sm font-medium text-amber-700 hover:text-amber-800"
      >
        Voltar para a estante
      </Link>
    </div>
  );
}

// Renderização do caso de sucesso, separada para o corpo da página não virar
// uma função com loading, erro e detalhe misturados.
function renderDetailContent(ebook: EbookDetail) {
  const formatLabel = formatExtension(ebook.format);
  const sizeLabel = formatBytes(ebook.size);
  const createdAtLabel = formatDate(ebook.createdAt);

  return (
    <div className="mt-6 flex flex-col gap-6 sm:flex-row">
      <div className="w-40 shrink-0">
        <EbookCover title={ebook.title} coverUrl={ebook.coverUrl} />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {ebook.title}
        </h1>

        {ebook.author && (
          <p className="text-sm text-neutral-600">{ebook.author}</p>
        )}

        <EbookStatusBadge status={ebook.status} className="mt-3 inline-block" />

        <p className="mt-4 text-sm text-neutral-700">
          {formatLabel} · {sizeLabel}
        </p>

        <p className="text-sm text-neutral-500">Enviado em {createdAtLabel}</p>

        {ebook.errorMessage && (
          <p className="mt-4 rounded-md bg-red-50 p-2 text-xs text-red-700">
            {ebook.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
