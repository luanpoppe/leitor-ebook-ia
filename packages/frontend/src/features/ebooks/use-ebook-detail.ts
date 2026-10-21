"use client";

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { getApiErrorInfo, getEbook, isNotFoundError } from "./api";
import type { EbookDetail, EbookStatus } from "./types";
import { ebookKeys } from "./use-ebooks";

const POLLING_INTERVAL_MS = 3000;

const ACTIVE_STATUSES: readonly EbookStatus[] = ["pending", "processing"];

export const ebookDetailKey = (id: string) =>
  [...ebookKeys.all, "detail", id] as const;

type EbookDetailQueryKey = ReturnType<typeof ebookDetailKey>;

type EbookDetailQueryResult = UseQueryResult<EbookDetail, Error>;

export interface UseEbookDetailResult {
  ebook: EbookDetail | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
  error: Error | null;
  errorMessage: string | null;
  refetch: EbookDetailQueryResult["refetch"];
}

export function useEbookDetail(id: string): UseEbookDetailResult {
  const isIdInformed = id.trim().length > 0;
  const queryKey = ebookDetailKey(id);

  const ebookQuery = useQuery<EbookDetail, Error, EbookDetail, EbookDetailQueryKey>(
    {
      queryKey,
      queryFn: () => fetchEbookDetail(id),
      enabled: isIdInformed,
      refetchInterval: (query) => resolveRefetchInterval(query.state.data),
    }
  );

  const ebook = ebookQuery.data ?? null;
  const error = ebookQuery.error ?? null;

  // 404 e falha de rede chegam pelo mesmo caminho de erro, mas pedem telas
  // diferentes: "não encontrado" não tem o que tentar de novo.
  const hasError = Boolean(error);
  const notFound = hasError && isNotFoundError(error);
  const errorMessage = resolveErrorMessage(ebookQuery);

  return {
    ebook,
    isLoading: ebookQuery.isLoading,
    isError: ebookQuery.isError,
    notFound,
    error,
    errorMessage,
    refetch: ebookQuery.refetch,
  };
}

async function fetchEbookDetail(id: string): Promise<EbookDetail> {
  const ebook = await getEbook(id);
  return ebook;
}

// A mensagem exibida vem do mesmo tradutor de erro da API, para a tela não
// depender do `message` cru do Axios.
function resolveErrorMessage(
  query: EbookDetailQueryResult
): string | null {
  if (!query.isError) return null;

  const errorInfo = getApiErrorInfo(query.error);
  return errorInfo.message;
}

// Enquanto a ingestão roda o detalhe muda sozinho; nos estados finais
// (`ready`/`failed`) o polling para até algo invalidar esta chave.
function resolveRefetchInterval(
  ebook: EbookDetail | undefined
): number | false {
  if (!ebook) return false;

  const isIngestionActive = ACTIVE_STATUSES.includes(ebook.status);
  if (!isIngestionActive) return false;

  return POLLING_INTERVAL_MS;
}
