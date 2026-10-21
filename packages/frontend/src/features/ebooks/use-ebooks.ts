"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { listEbooks } from "./api";
import { DEFAULT_PAGE_SIZE } from "./constants";
import type { EbookStatus, EbookSummary, PagedEbooks } from "./types";

const POLLING_INTERVAL_MS = 3000;

const ACTIVE_INGESTION_STATUSES: readonly EbookStatus[] = [
  "pending",
  "processing",
];

const FIRST_PAGE = 1;

export const ebookKeys = {
  all: ["ebooks"] as const,
  list: () => [...ebookKeys.all, "list"] as const,
};

type EbooksQueryKey = ReturnType<typeof ebookKeys.list>;

type EbooksQueryResult = UseInfiniteQueryResult<
  InfiniteData<PagedEbooks, number>,
  Error
>;

export type UseEbooksResult = Pick<
  EbooksQueryResult,
  | "isLoading"
  | "isError"
  | "error"
  | "refetch"
  | "hasNextPage"
  | "fetchNextPage"
  | "isFetchingNextPage"
> & {
  ebooks: EbookSummary[];
  total: number;
};

export function useEbooks(): UseEbooksResult {
  const ebooksQuery = useInfiniteQuery<
    PagedEbooks,
    Error,
    InfiniteData<PagedEbooks, number>,
    EbooksQueryKey,
    number
  >({
    queryKey: ebookKeys.list(),
    queryFn: ({ pageParam }) => fetchEbookPage(pageParam),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage, allPages) =>
      resolveNextPage(lastPage, allPages),
    refetchInterval: (query) => resolveRefetchInterval(query.state.data),
  });

  const pages = ebooksQuery.data?.pages;
  const ebooks = collectEbooks(pages);
  const total = getLastPageTotal(pages);

  return {
    ebooks,
    total,
    isLoading: ebooksQuery.isLoading,
    isError: ebooksQuery.isError,
    error: ebooksQuery.error,
    refetch: ebooksQuery.refetch,
    hasNextPage: ebooksQuery.hasNextPage,
    fetchNextPage: ebooksQuery.fetchNextPage,
    isFetchingNextPage: ebooksQuery.isFetchingNextPage,
  };
}

async function fetchEbookPage(page: number): Promise<PagedEbooks> {
  const params = { page, pageSize: DEFAULT_PAGE_SIZE };
  const pageData = await listEbooks(params);
  return pageData;
}

function resolveNextPage(
  lastPage: PagedEbooks,
  allPages: readonly PagedEbooks[]
): number | undefined {
  const loadedCount = countLoadedEbooks(allPages);
  const hasRemainingPages = loadedCount < lastPage.total;
  if (!hasRemainingPages) return undefined;

  return lastPage.page + 1;
}

// Só existe novidade na API enquanto algum livro está em ingestão; nos estados
// finais (`ready`/`failed`) o polling para até uma mutação invalidar a lista.
function resolveRefetchInterval(
  data: InfiniteData<PagedEbooks, number> | undefined
): number | false {
  const pages = data?.pages;
  if (!pages) return false;

  const isPollingNeeded = hasActiveIngestion(pages);
  if (!isPollingNeeded) return false;

  return POLLING_INTERVAL_MS;
}

function hasActiveIngestion(pages: readonly PagedEbooks[]): boolean {
  for (const page of pages) {
    for (const ebook of page.items) {
      const isActive = ACTIVE_INGESTION_STATUSES.includes(ebook.status);
      if (isActive) return true;
    }
  }

  return false;
}

function countLoadedEbooks(pages: readonly PagedEbooks[]): number {
  let loadedCount = 0;

  for (const page of pages) {
    loadedCount += page.items.length;
  }

  return loadedCount;
}

function collectEbooks(
  pages: readonly PagedEbooks[] | undefined
): EbookSummary[] {
  if (!pages) return [];

  const ebooks = pages.flatMap((page) => page.items);
  return ebooks;
}

function getLastPageTotal(
  pages: readonly PagedEbooks[] | undefined
): number {
  if (!pages || pages.length === 0) return 0;

  const lastPage = pages[pages.length - 1];
  return lastPage.total;
}
