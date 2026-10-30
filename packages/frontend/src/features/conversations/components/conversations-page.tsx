"use client";

import Link from "next/link";
import type { JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { AppShell } from "@/features/shelf/components/app-shell";
import { useAllConversations } from "../use-all-conversations";
import styles from "./conversations-page.module.css";

export function ConversationsPage(): JSX.Element {
  const { conversations, isLoading, error, reload } = useAllConversations();

  return (
    <AppShell active="conversations">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca pessoal</p>
          <h1 className={styles.title}>Conversas</h1>
          <p className={styles.subtitle}>
            Suas perguntas e respostas com a IA, de todos os livros.
          </p>
        </div>

        {!isLoading && error === null && (
          <span className={styles.count}>
            {conversations.length}{" "}
            {conversations.length === 1 ? "conversa" : "conversas"}
          </span>
        )}
      </header>

      {isLoading && <p className={styles.status}>Carregando conversas…</p>}

      {!isLoading && error !== null && (
        <div className={styles.statusBox}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}

      {!isLoading && error === null && conversations.length === 0 && (
        <p className={styles.empty}>
          Nenhuma conversa ainda. Abra um livro e use o botão{" "}
          <strong>Chat</strong> para começar.
        </p>
      )}

      {conversations.length > 0 && (
        <ul className={styles.list}>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/ebooks/${conversation.bookId}/ler?conversa=${conversation.id}`}
                className={styles.item}
              >
                <span className={styles.itemBook}>
                  {conversation.bookTitle}
                  {conversation.bookAuthor !== null && (
                    <span className={styles.itemAuthor}>
                      {" "}
                      · {conversation.bookAuthor}
                    </span>
                  )}
                </span>

                <span className={styles.itemTitle}>
                  {conversation.title ?? "Conversa sem título"}
                </span>

                <span className={styles.itemMeta}>
                  {formatDate(conversation.updatedAt)} ·{" "}
                  {conversation.messageCount}{" "}
                  {conversation.messageCount === 1 ? "mensagem" : "mensagens"}
                  <span className={styles.itemAction}>
                    Abrir no livro →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
