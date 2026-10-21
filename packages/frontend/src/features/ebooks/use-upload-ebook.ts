"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { getApiErrorInfo, uploadEbook } from "./api";
import type { UploadEbookResponse, UploadProgress } from "./types";
import { ebookKeys } from "./use-ebooks";

const INITIAL_PROGRESS = 0;

const UPLOAD_SUCCESS_MESSAGE = "Ebook enviado. O processamento já começou.";

type UploadEbookErrorInfo = ReturnType<typeof getApiErrorInfo>;

interface UploadEbookVariables {
  file: File;
}

export interface UseUploadEbookOptions {
  onSuccess?: (result: UploadEbookResponse) => void;
  onDuplicate?: (existingBookId: string) => void;
}

export interface UseUploadEbookResult {
  upload: (file: File) => void;
  progress: number;
  isUploading: boolean;
  errorInfo: UploadEbookErrorInfo | null;
  reset: () => void;
}

export function useUploadEbook(
  options: UseUploadEbookOptions = {}
): UseUploadEbookResult {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number>(INITIAL_PROGRESS);
  const [errorInfo, setErrorInfo] = useState<UploadEbookErrorInfo | null>(null);

  const handleUploadProgress = (update: UploadProgress): void => {
    setProgress(update.percent);
  };

  const uploadMutation = useMutation<
    UploadEbookResponse,
    unknown,
    UploadEbookVariables
  >({
    mutationFn: ({ file }) => uploadEbook(file, handleUploadProgress),
    onMutate: () => {
      setProgress(INITIAL_PROGRESS);
      setErrorInfo(null);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ebookKeys.all });
      toast.success(UPLOAD_SUCCESS_MESSAGE);
      // Progresso volta a zero no fim: a barra só existe durante o envio.
      setProgress(INITIAL_PROGRESS);
      options.onSuccess?.(result);
    },
    onError: (error) => {
      const failureInfo = getApiErrorInfo(error);
      setErrorInfo(failureInfo);
      toast.error(failureInfo.message);

      if (failureInfo.existingBookId) {
        options.onDuplicate?.(failureInfo.existingBookId);
      }
    },
  });

  const upload = (file: File): void => {
    uploadMutation.mutate({ file });
  };

  const reset = (): void => {
    setProgress(INITIAL_PROGRESS);
    setErrorInfo(null);
  };

  return {
    upload,
    progress,
    isUploading: uploadMutation.isPending,
    errorInfo,
    reset,
  };
}
