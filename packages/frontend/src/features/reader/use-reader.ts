"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  getChapterPage,
  getReadingProgress,
  listChapters,
} from "./api";
import type {
  ChapterPage,
  ChapterSummary,
  ReadingProgress,
} from "./types";

const FIRST_CHAPTER_POSITION = 1;

export const readerKeys = {
  all: ["reader"] as const,
  chapters: (bookId: string) =>
    [...readerKeys.all, "chapters", bookId] as const,
  progress: (bookId: string) =>
    [...readerKeys.all, "progress", bookId] as const,
  chapter: (bookId: string, position: number) =>
    [...readerKeys.all, "chapter", bookId, position] as const,
};

export type ReaderErrorKind =
  | "book-not-found"
  | "not-ready"
  | "chapter-not-found"
  | "unknown";

export interface UseReaderResult {
  chapters: ChapterSummary[];
  chapter: ChapterPage | null;
  currentPosition: number | null;
  isLoading: boolean;
  errorKind: ReaderErrorKind | null;
  resumeOffset: number;
  savedProgress: ReadingProgress | null;
  hasPrevious: boolean;
  hasNext: boolean;
  goToChapter(position: number): void;
  goNext(): void;
  goPrevious(): void;
  retry(): void;
}

export function useReader(
  bookId: string,
  initialChapterPosition: number | null,
  initialOffset: number | null = null
): UseReaderResult {
  const router = useRouter();
  const [navigatedPosition, setNavigatedPosition] = useState<number | null>(
    null
  );

  const isBookIdInformed = bookId.trim().length > 0;
  // O progresso é lido sempre: a URL pode trazer o capítulo, mas o offset salvo
  // ainda vale quando é o mesmo capítulo. Sem capítulo na URL, ele também
  // decide qual capítulo abre.
  const shouldReadProgress = initialChapterPosition === null;

  const chaptersQuery = useQuery<ChapterSummary[], Error>({
    queryKey: readerKeys.chapters(bookId),
    queryFn: () => fetchChapterList(bookId),
    enabled: isBookIdInformed,
  });

  const progressQuery = useQuery<ReadingProgress | null, Error>({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => fetchReadingProgress(bookId),
    enabled: isBookIdInformed,
  });

  const chapters = chaptersQuery.data ?? [];
  const savedProgress = progressQuery.data ?? null;
  const isStillResolvingInitialChapter =
    progressQuery.isLoading ||
    (shouldReadProgress && chaptersQuery.isLoading);
  // O ponto de retomada é congelado na abertura: as gravações seguintes
  // atualizam o progresso salvo, mas não podem reposicionar a página que já
  // está aberta.
  const openingProgressRef = useRef<ReadingProgress | null>(null);
  const hasResolvedOpeningRef = useRef(false);
  if (!hasResolvedOpeningRef.current && !isStillResolvingInitialChapter) {
    hasResolvedOpeningRef.current = true;
    openingProgressRef.current = savedProgress;
  }
  const openingProgress = openingProgressRef.current;
  const resolvedPosition = resolveCurrentPosition(
    initialChapterPosition,
    navigatedPosition,
    isStillResolvingInitialChapter,
    savedProgress,
    chapters
  );

  // Sem posição ainda, a query do capítulo fica desligada (posição 0 é só o
  // valor de chave enquanto a resolução não termina).
  const chapterPosition = resolvedPosition ?? 0;
  const isChapterQueryEnabled =
    isBookIdInformed && resolvedPosition !== null;
  const chapterQuery = useQuery<ChapterPage, Error>({
    queryKey: readerKeys.chapter(bookId, chapterPosition),
    queryFn: () => fetchChapter(bookId, chapterPosition),
    enabled: isChapterQueryEnabled,
  });

  const chapter = chapterQuery.data ?? null;
  const errorKind = resolveErrorKind(
    chaptersQuery.error,
    progressQuery.error,
    chapterQuery.error,
    shouldReadProgress
  );

  const isOpeningAtSavedChapter = navigatedPosition === null;
  const isAtSavedChapter =
    openingProgress !== null &&
    resolvedPosition === openingProgress.chapterPosition;
  // Um link com capítulo + offset (marcação, por exemplo) abre no offset exato
  // na primeira montagem. Depois de qualquer navegação o parâmetro não volta a
  // valer, senão voltar ao capítulo original puxaria a leitura para o destaque.
  const isOpeningAtUrlOffset =
    navigatedPosition === null &&
    initialOffset !== null &&
    initialChapterPosition !== null;
  const resumeOffset = isOpeningAtUrlOffset
    ? initialOffset
    : isOpeningAtSavedChapter && isAtSavedChapter
      ? openingProgress.offset
      : 0;

  const hasPrevious = chapter?.previousPosition != null;
  const hasNext = chapter?.nextPosition != null;

  const goToChapter = useCallback(
    (position: number) => {
      setNavigatedPosition(position);
      const href = `/ebooks/${bookId}/ler?capitulo=${position}`;
      // `replace` evita empilhar uma entrada por página virada (NT-4).
      router.replace(href, { scroll: false });
    },
    [bookId, router]
  );

  const goNext = useCallback(() => {
    const nextPosition = chapter?.nextPosition;
    if (nextPosition == null) return;
    goToChapter(nextPosition);
  }, [chapter, goToChapter]);

  const goPrevious = useCallback(() => {
    const previousPosition = chapter?.previousPosition;
    if (previousPosition == null) return;
    goToChapter(previousPosition);
  }, [chapter, goToChapter]);

  const refetchChapters = chaptersQuery.refetch;
  const refetchProgress = progressQuery.refetch;
  const refetchChapter = chapterQuery.refetch;
  const retry = useCallback(() => {
    void refetchChapters();
    void refetchProgress();
    void refetchChapter();
  }, [refetchChapters, refetchProgress, refetchChapter]);

  const isLoading = errorKind === null && chapterQuery.isLoading;

  return {
    chapters,
    chapter,
    currentPosition: resolvedPosition,
    isLoading,
    errorKind,
    resumeOffset,
    savedProgress,
    hasPrevious,
    hasNext,
    goToChapter,
    goNext,
    goPrevious,
    retry,
  };
}

async function fetchChapterList(bookId: string): Promise<ChapterSummary[]> {
  const chapters = await listChapters(bookId);
  return chapters;
}

async function fetchReadingProgress(
  bookId: string
): Promise<ReadingProgress | null> {
  const progress = await getReadingProgress(bookId);
  return progress;
}

// A tela paginada busca o texto em trechos (`useReaderWindow`); do capítulo
// inteiro ela só precisa dos metadados. Um caractere basta para a API devolver
// `totalLength`, `previousPosition` e `nextPosition` sem carregar o texto todo.
async function fetchChapter(
  bookId: string,
  position: number
): Promise<ChapterPage> {
  const chapter = await getChapterPage(bookId, position, 0, 1);
  return chapter;
}

// Prioridade: o capítulo escolhido pelo usuário vence a URL, que vence o
// progresso salvo, que vence o primeiro capítulo do sumário.
function resolveCurrentPosition(
  initialChapterPosition: number | null,
  navigatedPosition: number | null,
  isStillResolvingInitialChapter: boolean,
  savedProgress: ReadingProgress | null,
  chapters: ChapterSummary[]
): number | null {
  if (navigatedPosition !== null) return navigatedPosition;
  if (isStillResolvingInitialChapter) return null;
  if (initialChapterPosition !== null) return initialChapterPosition;

  if (savedProgress !== null) return savedProgress.chapterPosition;

  return resolveFirstChapterPosition(chapters);
}

function resolveFirstChapterPosition(chapters: ChapterSummary[]): number {
  const firstChapter = chapters[0];
  if (!firstChapter) return FIRST_CHAPTER_POSITION;

  return firstChapter.position;
}

function resolveErrorKind(
  chaptersError: Error | null,
  progressError: Error | null,
  chapterError: Error | null,
  isProgressRequired: boolean
): ReaderErrorKind | null {
  if (chaptersError) {
    const chaptersErrorInfo = getApiErrorInfo(chaptersError);
    if (chaptersErrorInfo.statusCode === 404) return "book-not-found";
    if (chaptersErrorInfo.statusCode === 409) return "not-ready";
    return "unknown";
  }

  // O progresso salvo decide a abertura quando a URL não trouxe capítulo; se
  // ele falhar nesse caso, não dá para retomar com segurança. Com capítulo na
  // URL, a leitura abre nele mesmo sem o progresso.
  if (progressError && isProgressRequired) return "unknown";

  if (chapterError) {
    const chapterErrorInfo = getApiErrorInfo(chapterError);
    if (chapterErrorInfo.statusCode === 404) return "chapter-not-found";
    return "unknown";
  }

  return null;
}
