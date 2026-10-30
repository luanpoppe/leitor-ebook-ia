"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  listAllConversations,
  type BookConversationSummary,
} from "../conversations/api";

export interface UseAllConversationsResult {
  conversations: BookConversationSummary[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
}

/** Conversas de todos os livros, para a página global. */
export function useAllConversations(): UseAllConversationsResult {
  const [conversations, setConversations] = useState<BookConversationSummary[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedConversations = await listAllConversations();
      setConversations(loadedConversations);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const reload = useCallback(() => {
    void loadConversations();
  }, [loadConversations]);

  return { conversations, isLoading, error, reload };
}
