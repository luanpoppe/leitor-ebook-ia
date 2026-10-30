"use client";

/* As imagens do chat vêm do backend dinâmico (MinIO); não passam pelo
   otimizador do next/image. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { getApiBaseUrl } from "@/utils/http";
import { AppShell } from "@/features/shelf/components/app-shell";
import { ChatMessageText } from "@/features/reader/chat/chat-message-text";
import type { ChatCitation, ChatMessage } from "@/features/reader/chat/types";
import { useConversationDetail } from "../use-conversation-detail";
import styles from "./conversation-page.module.css";

interface ConversationPageProps {
  conversationId: string;
}

export function ConversationPage({
  conversationId,
}: ConversationPageProps): JSX.Element {
  const router = useRouter();
  const { conversation, isLoading, error, reload } =
    useConversationDetail(conversationId);

  const openCitation = (citation: ChatCitation) => {
    const href = `/ebooks/${conversation?.bookId}/ler?capitulo=${citation.chapterPosition}`;
    router.push(href);
  };

  return (
    <AppShell active="conversations">
      <div className={styles.topBar}>
        <Link href="/conversas" className={styles.backLink}>
          ← Conversas
        </Link>
      </div>

      {isLoading && <p className={styles.status}>Carregando conversa…</p>}

      {!isLoading && error !== null && (
        <div className={styles.statusBox}>
          <p className={styles.error}>{error}</p>
          <div className={styles.errorActions}>
            <button type="button" className={styles.retry} onClick={reload}>
              Tentar de novo
            </button>
            <Link href="/conversas" className={styles.secondaryLink}>
              Voltar para conversas
            </Link>
          </div>
        </div>
      )}

      {conversation !== null && (
        <>
          <header className={styles.header}>
            <div className={styles.headerBody}>
              <p className={styles.book}>
                {conversation.bookTitle}
                {conversation.bookAuthor !== null && (
                  <span className={styles.author}>
                    {" "}
                    · {conversation.bookAuthor}
                  </span>
                )}
              </p>
              <h1 className={styles.title}>
                {conversation.title ?? "Conversa sem título"}
              </h1>
              <p className={styles.meta}>
                {conversation.messages.length}{" "}
                {conversation.messages.length === 1 ? "mensagem" : "mensagens"}{" "}
                · atualizada em {formatDate(conversation.updatedAt)}
              </p>
            </div>

            <Link
              href={`/ebooks/${conversation.bookId}/ler?conversa=${conversation.id}`}
              className={styles.readButton}
            >
              Abrir o chat no livro
            </Link>
          </header>

          {conversation.messages.length === 0 && (
            <p className={styles.status}>
              Esta conversa ainda não tem mensagens.
            </p>
          )}

          <div className={styles.messages}>
            {conversation.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCitationSelect={openCitation}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  onCitationSelect(citation: ChatCitation): void;
}

function MessageBubble({
  message,
  onCitationSelect,
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === "USER";
  const bubbleClassName = isUser
    ? `${styles.bubble} ${styles.userBubble}`
    : `${styles.bubble} ${styles.assistantBubble}`;

  return (
    <article className={bubbleClassName}>
      <span className={styles.messageMeta}>
        {isUser ? "Você" : "IA"} · {formatDate(message.createdAt)}
      </span>

      {isUser ? (
        <>
          {message.selection !== null && message.selection.length > 0 && (
            <blockquote className={styles.selection}>
              <span className={styles.selectionLabel}>Trecho selecionado</span>
              <p className={styles.selectionText}>{message.selection}</p>
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

          {message.imageUrl !== null && (
            <img
              src={`${getApiBaseUrl()}${message.imageUrl}`}
              alt="Imagem gerada a partir do livro"
              className={styles.image}
              loading="lazy"
            />
          )}

          {message.citations.length > 0 && message.imageUrl === null && (
            <p className={styles.sources}>
              Fontes:{" "}
              {message.citations
                .map((citation) =>
                  citation.chapterTitle === null
                    ? `Capítulo ${citation.chapterPosition}`
                    : `Capítulo ${citation.chapterPosition} — ${citation.chapterTitle}`
                )
                .join(" · ")}
            </p>
          )}

          {(message.noteActions?.length ?? 0) > 0 && (
            <p className={styles.noteHint}>
              {(message.noteActions ?? [])
                .map((action) => `Anotação: ${action.title}`)
                .join(" · ")}{" "}
              — veja em{" "}
              <Link href="/anotacoes" className={styles.inlineLink}>
                Anotações
              </Link>
              .
            </p>
          )}
        </>
      )}
    </article>
  );
}
