"use client";

import { useParams } from "next/navigation";
import { BookDetailPage } from "@/features/shelf/components/book-detail-page";

type RouteParams = { id: string | string[] };

export default function EbookPage() {
  const params = useParams<RouteParams>();

  return <BookDetailPage bookId={resolveBookId(params?.id)} />;
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
