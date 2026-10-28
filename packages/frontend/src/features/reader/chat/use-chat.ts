"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorInfo } from "@/features/ebooks/api";
import {
  askQuestion,
  createConversation,
  getConversation,
  listConversations,
} from "./api";
import type {
  AskQuestionInput,
  ChatMessage,
  ConversationSummary,
} from "./types";

const CHAT_ERROR_MESSAGE = "Não foi possível falar com o chat agora.";

export interface UseChatResult {
  conversations: ConversationSummary[];
  messages: ChatMessage[];
  activeConversationId: string | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  send(input: AskQuestionInput): Promise<void>;
  openConversation(conversationId: string): Promise<void>;
  startNewConversation(): Promise<void>;
  retry(): Promise<void>;
}

/**
 * Estado do chat do livro. Carrega as conversas quando o painel abre, mantém a
 * conversa ativa e envia perguntas no escopo escolhido.
 */
export function useChat(bookId: string, enabled: boolean): UseChatResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastInputRef = useRef<AskQuestionInput | null>(null);
  const isInitializedRef = useRef(false);

  const refreshConversations = useCallback(async () => {
    const items = await listConversations(bookId);
    setConversations(items);
  }, [bookId]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const conversation = await getConversation(bookId, conversationId);
      setActiveConversationId(conversation.id);
      setMessages(conversation.messages);
    },
    [bookId]
  );

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const items = await listConversations(bookId);
      setConversations(items);

      const firstConversation = items[0];
      if (firstConversation !== undefined) {
        await loadConversation(firstConversation.id);
        return;
      }

      const created = await createConversation(bookId);
      setActiveConversationId(created.id);
      setMessages(created.messages);
      setConversations([
        {
          id: created.id,
          title: created.title,
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        },
      ]);
    } catch (cause) {
      setError(resolveErrorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [bookId, loadConversation]);

  useEffect(() => {
    if (!enabled) return;
    if (isInitializedRef.current) return;

    isInitializedRef.current = true;
    void initialize();
  }, [enabled, initialize]);

  const send = useCallback(
    async (input: AskQuestionInput) => {
      if (isSending) return;

      let conversationId = activeConversationId;
      setIsSending(true);
      setError(null);
      lastInputRef.current = input;

      // Mostra a pergunta na hora: a resposta pode demorar e o campo já foi
      // limpo, então sem isso o chat parece vazio enquanto "Pensando…".
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        role: "USER",
        content: input.question,
        selection: input.selection ?? null,
        imageUrl: null,
        citations: [],
        noteActions: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimisticMessage]);

      try {
        if (conversationId === null) {
          const created = await createConversation(bookId);
          conversationId = created.id;
          setActiveConversationId(created.id);
        }

        const response = await askQuestion(bookId, conversationId, input);
        setMessages((current) => [
          ...current.filter((message) => message.id !== optimisticId),
          ...response.messages,
        ]);
        await refreshConversations();
      } catch (cause) {
        setError(resolveErrorMessage(cause));
      } finally {
        setIsSending(false);
      }
    },
    [activeConversationId, bookId, isSending, refreshConversations]
  );

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === activeConversationId) return;

      setIsLoading(true);
      setError(null);

      try {
        await loadConversation(conversationId);
      } catch (cause) {
        setError(resolveErrorMessage(cause));
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId, loadConversation]
  );

  const startNewConversation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const created = await createConversation(bookId);
      setActiveConversationId(created.id);
      setMessages(created.messages);
      await refreshConversations();
    } catch (cause) {
      setError(resolveErrorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [bookId, refreshConversations]);

  const retry = useCallback(async () => {
    const lastInput = lastInputRef.current;
    if (lastInput === null) {
      await initialize();
      return;
    }

    // A pergunta anterior ficou na tela com o erro; some antes de reenviar para
    // não duplicar o balão otimista.
    setMessages((current) =>
      current.filter((message) => !message.id.startsWith("optimistic-"))
    );
    await send(lastInput);
  }, [initialize, send]);

  return {
    conversations,
    messages,
    activeConversationId,
    isLoading,
    isSending,
    error,
    send,
    openConversation,
    startNewConversation,
    retry,
  };
}

function resolveErrorMessage(cause: unknown): string {
  const errorInfo = getApiErrorInfo(cause);
  if (errorInfo.message.length > 0) return errorInfo.message;

  return CHAT_ERROR_MESSAGE;
}
