"use client";

/* As imagens vêm do backend dinâmico (MinIO); o otimizador do next/image não
   se aplica a elas. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, JSX, KeyboardEvent as ReactKeyboardEvent } from "react";
import { env } from "@/env";
import { ChatMessageText, describeCitation } from "./chat-message-text";
import { listBookImages, type BookImage } from "./images-api";
import type { ChatCitation, ChatScope, ChatSelection } from "./types";
import { useChat } from "./use-chat";
import styles from "./reader-chat-drawer.module.css";

interface ReaderChatDrawerProps {
  bookId: string;
  /** Capítulo e offset do topo visível: base do escopo "até aqui". */
  position: number;
  offset: number;
  /** Faixa de texto da página atual e das duas anteriores. */
  contextStart: number;
  contextEnd: number;
  /** Trecho selecionado no texto: foco da próxima pergunta. */
  selection: ChatSelection | null;
  onClearSelection(): void;
  /** Um modal está por cima: o Esc é dele, não do chat. */
  isSuspended?: boolean;
  onClose(): void;
  onCitationSelect(citation: ChatCitation): void;
}

const SCOPE_OPTIONS: Array<{
  value: ChatScope;
  label: string;
  hint: string;
}> = [
  {
    value: "up-to-current",
    label: "Até aqui",
    hint: "A IA busca só nos trechos até a página atual.",
  },
  {
    value: "whole-book",
    label: "Livro todo",
    hint: "A IA pode buscar em qualquer trecho do livro.",
  },
];

export function ReaderChatDrawer({
  bookId,
  position,
  offset,
  contextStart,
  contextEnd,
  selection,
  onClearSelection,
  isSuspended = false,
  onClose,
  onCitationSelect,
}: ReaderChatDrawerProps): JSX.Element {
  const {
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
  } = useChat(bookId, true);

  const [scope, setScope] = useState<ChatScope>("up-to-current");
  const [question, setQuestion] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<BookImage[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<BookImage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Abriu a partir de uma seleção: o teclado já pode ir para a pergunta.
  useEffect(() => {
    if (selection === null) return;

    inputRef.current?.focus();
    // Só na montagem: reabrir conversa não deve puxar o teclado de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSuspended) return;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;

      onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isSuspended, onClose]);

  const submitQuestion = useCallback(
    async (rawQuestion: string) => {
      const trimmedQuestion = rawQuestion.trim();
      if (trimmedQuestion.length === 0 || isSending) return;

      setQuestion("");
      await send({
        question: trimmedQuestion,
        scope,
        position,
        offset,
        contextStart,
        contextEnd,
        selection: selection?.text,
        selectionBefore: selection?.before,
      });
    },
    [
      contextEnd,
      contextStart,
      isSending,
      offset,
      position,
      scope,
      selection,
      send,
    ]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitQuestion(question);
    },
    [question, submitQuestion]
  );

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const isEnter = event.key === "Enter";
      const isShiftPressed = event.shiftKey;
      if (!isEnter || isShiftPressed) return;

      event.preventDefault();
      void submitQuestion(question);
    },
    [question, submitQuestion]
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setIsHistoryOpen(false);
      void openConversation(conversationId);
    },
    [openConversation]
  );

  const handleStartNew = useCallback(() => {
    setIsHistoryOpen(false);
    void startNewConversation();
  }, [startNewConversation]);

  const openGallery = useCallback(async () => {
    setIsGalleryOpen(true);
    setIsGalleryLoading(true);
    setGalleryError(null);

    try {
      setGalleryImages(await listBookImages(bookId));
    } catch (cause) {
      setGalleryError(
        cause instanceof Error ? cause.message : "Falha ao carregar as imagens."
      );
    } finally {
      setIsGalleryLoading(false);
    }
  }, [bookId]);

  const activeScope = SCOPE_OPTIONS.find((option) => option.value === scope);

  return (
    <div className={styles.layer}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      <aside
        className={styles.panel}
        role="dialog"
        aria-label="Chat do livro"
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <h2 className={styles.title}>Chat do livro</h2>
            <span className={styles.caption}>
              Pergunte sobre o que você está lendo
            </span>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => void openGallery()}
            >
              Galeria
            </button>
            <button
              type="button"
              className={styles.smallButton}
              aria-expanded={isHistoryOpen}
              onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
            >
              Conversas
            </button>
            <button
              type="button"
              className={styles.smallButton}
              onClick={handleStartNew}
            >
              Nova
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Fechar chat"
            >
              Fechar
            </button>
          </div>
        </header>

        {isGalleryOpen && (
          <section
            className={styles.galleryPanel}
            aria-label="Galeria de imagens"
          >
            <div className={styles.galleryHeader}>
              <h3 className={styles.galleryTitle}>Imagens geradas</h3>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => setIsGalleryOpen(false)}
              >
                Voltar
              </button>
            </div>

            {isGalleryLoading && (
              <p className={styles.status}>Carregando imagens…</p>
            )}
            {galleryError !== null && (
              <p className={styles.galleryError}>{galleryError}</p>
            )}
            {!isGalleryLoading &&
              galleryError === null &&
              galleryImages.length === 0 && (
                <p className={styles.status}>
                  Nenhuma imagem gerada ainda. Peça uma no chat.
                </p>
              )}

            <div className={styles.galleryGrid}>
              {galleryImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={styles.galleryItem}
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={`${env.NEXT_PUBLIC_API_URL}${image.url}`}
                    alt={image.prompt.slice(0, 90)}
                    className={styles.galleryImage}
                    loading="lazy"
                  />
                  <span className={styles.galleryPrompt}>{image.prompt}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {isHistoryOpen && (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
          />
        )}

        {selection !== null && (
          <div className={styles.selectionBar}>
            <div className={styles.selectionHeader}>
              <span className={styles.selectionLabel}>Trecho selecionado</span>
              <button
                type="button"
                className={styles.selectionClear}
                onClick={onClearSelection}
                aria-label="Remover trecho selecionado"
              >
                ×
              </button>
            </div>
            <p className={styles.selectionText}>{selection.text}</p>
          </div>
        )}

        <div className={styles.scopeBar} role="group" aria-label="Escopo da resposta">
          {SCOPE_OPTIONS.map((option) => {
            const isActive = option.value === scope;
            const className = isActive
              ? `${styles.scopeButton} ${styles.scopeButtonActive}`
              : styles.scopeButton;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                className={className}
                onClick={() => setScope(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className={styles.scopeHint}>{activeScope?.hint}</p>

        <div className={styles.messages}>
          {isLoading && (
            <p className={styles.status} aria-live="polite">
              Carregando conversa…
            </p>
          )}

          {!isLoading && messages.length === 0 && (
            <p className={styles.empty}>
              Pergunte qualquer coisa sobre o livro — a IA responde com base no
              texto e cita o trecho usado.
            </p>
          )}

          {messages.map((message) => {
            const isUser = message.role === "USER";
            const bubbleClassName = isUser
              ? `${styles.bubble} ${styles.userBubble}`
              : `${styles.bubble} ${styles.assistantBubble}`;

            return (
              <div key={message.id} className={bubbleClassName}>
                {isUser ? (
                  <>
                    {typeof message.selection === "string" &&
                      message.selection.length > 0 && (
                        <blockquote className={styles.messageSelection}>
                          <span className={styles.messageSelectionLabel}>
                            Trecho selecionado
                          </span>
                          <p className={styles.messageSelectionText}>
                            {message.selection}
                          </p>
                        </blockquote>
                      )}
                    <p className={styles.userText}>{message.content}</p>
                  </>
                ) : (
                  <>
                    <ChatMessageText
                      content={message.content}
                      citations={message.citations}
                      onCitationSelect={onCitationSelect}
                    />
                    {message.citations.length > 0 && (
                      <p className={styles.sources}>
                        Fontes:{" "}
                        {resolveSourceLabels(message.citations).join(" · ")}
                      </p>
                    )}
                    {message.imageUrl !== null && (
                      <img
                        src={`${env.NEXT_PUBLIC_API_URL}${message.imageUrl}`}
                        alt="Imagem gerada a partir do livro"
                        className={styles.messageImage}
                        loading="lazy"
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {isSending && (
            <div className={`${styles.bubble} ${styles.assistantBubble}`}>
              <p className={styles.status} aria-live="polite">
                Pensando…
              </p>
            </div>
          )}

          {error !== null && (
            <div className={styles.error} role="status">
              <span>{error}</span>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => void retry()}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              selection !== null
                ? "Pergunte sobre o trecho…"
                : "Pergunte sobre o livro…"
            }
            className={styles.input}
            rows={2}
            disabled={isSending}
            aria-label="Sua pergunta"
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isSending || question.trim().length === 0}
          >
            Enviar
          </button>
        </form>
      </aside>

      {selectedImage !== null && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Imagem gerada"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={`${env.NEXT_PUBLIC_API_URL}${selectedImage.url}`}
            alt={selectedImage.prompt.slice(0, 120)}
            className={styles.lightboxImage}
          />
          <p className={styles.lightboxPrompt}>{selectedImage.prompt}</p>
        </div>
      )}
    </div>
  );
}

interface ConversationListProps {
  conversations: Array<{
    id: string;
    title: string | null;
    messageCount: number;
  }>;
  activeConversationId: string | null;
  onSelect(conversationId: string): void;
}

// Várias citações do mesmo trecho não devem repetir a linha de fontes.
function resolveSourceLabels(citations: ChatCitation[]): string[] {
  const labels: string[] = [];

  for (const citation of citations) {
    const label = describeCitation(citation);
    const isRepeated = labels.includes(label);
    if (isRepeated) continue;

    labels.push(label);
  }

  return labels;
}

function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
}: ConversationListProps): JSX.Element {
  return (
    <ul className={styles.conversationList}>
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeConversationId;
        const className = isActive
          ? `${styles.conversationItem} ${styles.conversationItemActive}`
          : styles.conversationItem;
        const title = conversation.title ?? "Conversa sem título";

        return (
          <li key={conversation.id}>
            <button
              type="button"
              className={className}
              onClick={() => onSelect(conversation.id)}
            >
              <span className={styles.conversationTitle}>{title}</span>
              <span className={styles.conversationMeta}>
                {conversation.messageCount} mensagem(s)
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
