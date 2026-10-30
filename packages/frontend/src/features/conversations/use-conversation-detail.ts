"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  getConversationDetail,
  type BookConversationDetail,
} from "./api";

export interface UseConversationDetailResult {
  conversation: BookConversationDetail | null;
  isLoading: boolean;
  error: string | null;
  reload(): void;
}

export function useConversationDetail(
  conversationId: string
): UseConversationDetailResult {
  const [conversation, setConversation] =
    useState<BookConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversation = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedConversation = await getConversationDetail(conversationId);
      setConversation(loadedConversation);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  const reload = useCallback(() => {
    void loadConversation();
  }, [loadConversation]);

  return { conversation, isLoading, error, reload };
}
