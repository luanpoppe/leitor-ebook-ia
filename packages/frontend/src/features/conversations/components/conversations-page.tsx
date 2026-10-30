"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { formatDate } from "@/features/ebooks/format";
import { AppShell } from "@/features/shelf/components/app-shell";
import { useAllConversations } from "../use-all-conversations";
import styles from "./conversations-page.module.css";

interface BookFilter {
  id: string;
  title: string;
  author: string | null;
  count: number;
}

export function ConversationsPage(): JSX.Element {
  const { conversations, isLoading, error, reload } = useAllConversations();
  const [selectedBookId, setSelectedBookId] = useState("");
  const [query, setQuery] = useState("");

  const books = useMemo<BookFilter[]>(() => {
    const byId = new Map<string, BookFilter>();

    for (const conversation of conversations) {
      const current = byId.get(conversation.bookId);
      if (current === undefined) {
        byId.set(conversation.bookId, {
          id: conversation.bookId,
          title: conversation.bookTitle,
          author: conversation.bookAuthor,
          count: 1,
        });
        continue;
      }

      byId.set(conversation.bookId, {
        ...current,
        count: current.count + 1,
      });
    }

    return [...byId.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR")
    );
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

    return conversations.filter((conversation) => {
      const matchesBook =
        selectedBookId.length === 0 || conversation.bookId === selectedBookId;
      if (!matchesBook) return false;
      if (normalizedQuery.length === 0) return true;

      const searchableText = [
        conversation.title ?? "",
        conversation.bookTitle,
        conversation.bookAuthor ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(normalizedQuery);
    });
  }, [conversations, query, selectedBookId]);

  const handleBookChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBookId(event.target.value);
  };

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

      {!isLoading && error === null && conversations.length > 0 && (
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Livro</span>
            <select
              value={selectedBookId}
              onChange={handleBookChange}
              className={styles.select}
            >
              <option value="">
                Todos os livros ({conversations.length})
              </option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} ({book.count})
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Tema</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tema da conversa, livro ou autor…"
              className={styles.input}
            />
          </label>
        </div>
      )}

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

      {!isLoading &&
        error === null &&
        conversations.length > 0 &&
        filteredConversations.length === 0 && (
          <p className={styles.empty}>
            Nenhuma conversa encontrada com esses filtros.
          </p>
        )}

      {filteredConversations.length > 0 && (
        <ul className={styles.list}>
          {filteredConversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/conversas/${conversation.id}`}
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
                  <span className={styles.itemAction}>Ver conversa →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
