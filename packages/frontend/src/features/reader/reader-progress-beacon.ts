import { getApiBaseUrl } from "@/utils/http";
import type { SaveReadingProgressInput } from "./types";

/**
 * Gravação de progresso no fechamento da aba.
 *
 * `pagehide` não garante que um PUT normal termine; `sendBeacon` (ou `fetch`
 * com `keepalive`) sobrevive ao descarregamento da página. É best-effort:
 * nunca lança, porque já estamos saindo.
 */
export class ReaderProgressBeacon {
  static send(bookId: string, input: SaveReadingProgressInput): void {
    const url = buildProgressUrl(bookId);
    const body = JSON.stringify(input);
    const wasQueued = trySendBeacon(url, body);
    if (wasQueued) return;

    sendWithFetch(url, body);
  }
}

function buildProgressUrl(bookId: string): string {
  return `${getApiBaseUrl()}/ebooks/${bookId}/progress`;
}

function trySendBeacon(url: string, body: string): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.sendBeacon !== "function") return false;

  const payload = new Blob([body], { type: "application/json" });
  return navigator.sendBeacon(url, payload);
}

function sendWithFetch(url: string, body: string): void {
  const request = fetch(url, {
    method: "PUT",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  });
  request.catch(() => {});
}
