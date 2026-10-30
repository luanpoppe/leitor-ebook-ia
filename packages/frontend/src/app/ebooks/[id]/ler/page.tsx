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
  const rawOffset = searchParams.get("offset");
  const initialOffset = resolveOffset(rawOffset);
  const rawConversation = searchParams.get("conversa");
  const initialConversationId = resolveConversationId(rawConversation);

  return (
    <ReaderScreen
      bookId={bookId}
      initialChapterPosition={initialChapterPosition}
      initialOffset={initialOffset}
      initialConversationId={initialConversationId}
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

// Offset do link só vale com capítulo na URL; qualquer outro valor é ignorado.
const OFFSET_PARAM_PATTERN = /^\d+$/;

function resolveOffset(rawOffset: string | null): number | null {
  if (rawOffset === null) return null;

  const isValidFormat = OFFSET_PARAM_PATTERN.test(rawOffset);
  if (!isValidFormat) return null;

  const parsedOffset = Number.parseInt(rawOffset, 10);
  return Number.isSafeInteger(parsedOffset) ? parsedOffset : null;
}

// Só UUID vira conversa inicial; qualquer outra coisa é ignorada.
const CONVERSATION_PARAM_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveConversationId(rawConversation: string | null): string | null {
  if (rawConversation === null) return null;

  const conversationId = rawConversation.trim();
  const isValid = CONVERSATION_PARAM_PATTERN.test(conversationId);
  if (!isValid) return null;

  return conversationId;
}
