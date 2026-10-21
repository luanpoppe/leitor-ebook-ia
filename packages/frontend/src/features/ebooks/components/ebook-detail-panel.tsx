"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
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

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const OVERLAY_CLASS_NAME =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";

const PANEL_CLASS_NAME =
  "max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl";

const CLOSE_BUTTON_CLASS_NAME =
  "rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

const RETRY_BUTTON_CLASS_NAME =
  "mt-2 rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50";

const OPEN_PAGE_LINK_CLASS_NAME =
  "text-xs font-medium text-neutral-600 underline hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

export function EbookDetailPanel({ bookId, onClose }: EbookDetailPanelProps) {
  // O hook roda sempre (regra dos hooks); sem id ele não busca nada.
  const { ebook, isLoading, isError, notFound, errorMessage, refetch } =
    useEbookDetail(bookId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Painel modal: segura o scroll da página por baixo, leva o foco para o
  // botão de fechar e, ao sair, devolve o foco para quem abriu o painel.
  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      const elementToRestore =
        previouslyFocusedElement instanceof HTMLElement
          ? previouslyFocusedElement
          : null;
      if (elementToRestore?.isConnected) elementToRestore.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDialogKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );

    const hasFocusableElements = focusableElements.length > 0;
    if (!hasFocusableElements) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    const isLeavingFromLast = !event.shiftKey && activeElement === lastElement;
    const isLeavingFromFirst = event.shiftKey && activeElement === firstElement;

    if (isLeavingFromLast) {
      event.preventDefault();
      firstElement.focus();
      return;
    }

    if (isLeavingFromFirst) {
      event.preventDefault();
      lastElement.focus();
    }
  };

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
      const failureMessage = errorMessage ?? GENERIC_ERROR_LABEL;

      return (
        <div className="py-8 text-center">
          <p className="text-sm text-red-700">{failureMessage}</p>

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

    return renderDetailContent(ebook, onClose);
  };

  return (
    <div className={OVERLAY_CLASS_NAME} onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ELEMENT_ID}
        className={PANEL_CLASS_NAME}
        onClick={handleContentClick}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex justify-end">
          <button
            ref={closeButtonRef}
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
function renderDetailContent(ebook: EbookDetail, onClose: () => void) {
  const sizeLabel = formatBytes(ebook.size);
  const formatLabel = formatExtension(ebook.format);
  const createdAtLabel = formatDate(ebook.createdAt);
  const ownPageHref = `/ebooks/${ebook.id}`;

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

        <div className="mt-2 flex items-center gap-3">
          <EbookStatusBadge status={ebook.status} />

          <Link
            href={ownPageHref}
            onClick={onClose}
            className={OPEN_PAGE_LINK_CLASS_NAME}
          >
            Abrir em página própria
          </Link>
        </div>

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
