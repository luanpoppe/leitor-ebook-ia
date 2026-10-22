"use client";

import { Suspense } from "react";
import type { JSX } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ReaderScreen } from "@/features/reader/components/reader-screen";

type RouteParams = { id: string | string[] };

export default function ReadingPage() {
  return (
    <Suspense fallback={null}>
      <ReaderRoute />
    </Suspense>
  );
}

function ReaderRoute(): JSX.Element {
  const params = useParams<RouteParams>();
  const searchParams = useSearchParams();

  const bookId = resolveBookId(params?.id);
  const rawChapter = searchParams.get("capitulo");
  const initialChapterPosition = resolveChapterPosition(rawChapter);

  return (
    <ReaderScreen
      bookId={bookId}
      initialChapterPosition={initialChapterPosition}
    />
  );
}

// A rota pode chegar como ausente ou como lista; só o primeiro segmento importa.
function resolveBookId(rawId: string | string[] | undefined): string {
  if (Array.isArray(rawId)) {
    const [firstId] = rawId;
    return firstId?.trim() ?? "";
  }

  return rawId?.trim() ?? "";
}

// O parâmetro aceita apenas inteiro a partir de 1; qualquer outra coisa cai no
// capítulo salvo (ou no primeiro), decidido pelo useReader.
const CHAPTER_PARAM_PATTERN = /^\d+$/;

function resolveChapterPosition(rawChapter: string | null): number | null {
  if (rawChapter === null) return null;

  const isValidFormat = CHAPTER_PARAM_PATTERN.test(rawChapter);
  if (!isValidFormat) return null;

  const parsedPosition = Number.parseInt(rawChapter, 10);
  const isValidPosition = parsedPosition >= 1;
  if (!isValidPosition) return null;

  return parsedPosition;
}
