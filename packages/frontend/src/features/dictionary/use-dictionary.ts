"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import { listDictionary, type DictionaryEntry } from "./api";

export interface UseDictionaryResult {
  entries: DictionaryEntry[];
  isLoading: boolean;
  error: string | null;
  reload(): void;
}

export function useDictionary(): UseDictionaryResult {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedEntries = await listDictionary();
      setEntries(loadedEntries);
    } catch (cause) {
      setError(getApiErrorInfo(cause).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const reload = useCallback(() => {
    void loadEntries();
  }, [loadEntries]);

  return { entries, isLoading, error, reload };
}
