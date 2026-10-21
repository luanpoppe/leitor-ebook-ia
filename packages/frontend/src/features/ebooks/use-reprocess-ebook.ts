"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { getApiErrorInfo, reprocessEbook } from "./api";
import type { ReprocessEbookResponse } from "./types";
import { ebookDetailKey } from "./use-ebook-detail";
import { ebookKeys } from "./use-ebooks";

const REPROCESS_SUCCESS_MESSAGE = "Livro reenviado para processamento.";

export interface UseReprocessEbookResult {
  reprocess: (id: string) => void;
  isReprocessingFor: (id: string) => boolean;
}

export function useReprocessEbook(): UseReprocessEbookResult {
  const queryClient = useQueryClient();
  // Cada livro tem o próprio estado de envio: vários reprocessamentos podem
  // estar em voo ao mesmo tempo, cada um com o seu botão em "Tentando...".
  const [inFlightIds, setInFlightIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  const markInFlight = (id: string): void => {
    setInFlightIds((currentIds) => {
      if (currentIds.has(id)) return currentIds;

      const nextIds = new Set(currentIds);
      nextIds.add(id);
      return nextIds;
    });
  };

  const clearInFlight = (id: string): void => {
    setInFlightIds((currentIds) => {
      if (!currentIds.has(id)) return currentIds;

      const nextIds = new Set(currentIds);
      nextIds.delete(id);
      return nextIds;
    });
  };

  const reprocessMutation = useMutation<
    ReprocessEbookResponse,
    unknown,
    string
  >({
    mutationFn: (id) => reprocessEbook(id),
    onMutate: (id) => {
      markInFlight(id);
    },
    onSuccess: async (ebook) => {
      const detailKey = ebookDetailKey(ebook.id);
      await queryClient.invalidateQueries({ queryKey: ebookKeys.all });
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(REPROCESS_SUCCESS_MESSAGE);
    },
    onError: async (error) => {
      const failureInfo = getApiErrorInfo(error);
      toast.error(failureInfo.message);
      // A estante também é invalidada no erro: o livro pode ter mudado de
      // estado no servidor mesmo que a resposta da mutação tenha falhado.
      await queryClient.invalidateQueries({ queryKey: ebookKeys.all });
    },
    onSettled: (_data, _error, id) => {
      clearInFlight(id);
    },
  });

  const reprocess = (id: string): void => {
    const isAlreadyInFlight = inFlightIds.has(id);
    if (isAlreadyInFlight) return;

    reprocessMutation.mutate(id);
  };

  const isReprocessingFor = (id: string): boolean => inFlightIds.has(id);

  return {
    reprocess,
    isReprocessingFor,
  };
}
