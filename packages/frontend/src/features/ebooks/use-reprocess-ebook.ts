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
  isReprocessing: boolean;
  reprocessingId: string | null;
}

export function useReprocessEbook(): UseReprocessEbookResult {
  const queryClient = useQueryClient();
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const reprocessMutation = useMutation<
    ReprocessEbookResponse,
    unknown,
    string
  >({
    mutationFn: (id) => reprocessEbook(id),
    onMutate: (id) => {
      setReprocessingId(id);
    },
    onSuccess: async (ebook) => {
      const detailKey = ebookDetailKey(ebook.id);
      await queryClient.invalidateQueries({ queryKey: ebookKeys.all });
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(REPROCESS_SUCCESS_MESSAGE);
    },
    onError: (error) => {
      const failureInfo = getApiErrorInfo(error);
      toast.error(failureInfo.message);
    },
    onSettled: () => {
      setReprocessingId(null);
    },
  });

  const reprocess = (id: string): void => {
    reprocessMutation.mutate(id);
  };

  return {
    reprocess,
    isReprocessing: reprocessMutation.isPending,
    reprocessingId,
  };
}
