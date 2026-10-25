import { getChapterPage } from "../api";
import type { ChapterPage } from "../types";
import {
  WINDOW_SIZE,
  type TextWindow,
  type WindowPoint,
  toWindowKey,
} from "./window-types";

export class WindowFetcher {
  static readonly MAX_WINDOWS = 3;

  private readonly bookId: string;
  private readonly cache = new Map<string, TextWindow>();
  private readonly inFlight = new Map<string, Promise<TextWindow>>();

  constructor(bookId: string) {
    this.bookId = bookId;
  }

  /** Devolve do cache ou busca; deduplica requisição em voo. */
  get(point: WindowPoint): Promise<TextWindow> {
    const key = toWindowKey(point);
    const cached = this.cache.get(key);
    if (cached) {
      this.touch(key, cached);
      return Promise.resolve(cached);
    }

    // Duas chamadas para o mesmo ponto enquanto a busca corre compartilham a
    // mesma Promise, então a fronteira do trecho não é buscada duas vezes.
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.load(point, key);
    this.inFlight.set(key, request);
    return request;
  }

  /** Só o cache, sem buscar. */
  peek(point: WindowPoint): TextWindow | null {
    const key = toWindowKey(point);
    const cached = this.cache.get(key);
    if (!cached) return null;

    return cached;
  }

  /**
   * Dispara a busca sem bloquear (usado pela pré-busca). Nunca rejeita: falha é
   * ignorada aqui.
   */
  prefetch(point: WindowPoint): void {
    const request = this.get(point);
    const ignoreFailure = () => undefined;
    request.catch(ignoreFailure);
  }

  private async load(point: WindowPoint, key: string): Promise<TextWindow> {
    try {
      const page = await getChapterPage(
        this.bookId,
        point.position,
        point.offset,
        WINDOW_SIZE
      );
      const textWindow = WindowFetcher.toTextWindow(page);
      this.remember(key, textWindow);
      return textWindow;
    } finally {
      // Erro não fica guardado: a próxima chamada tenta buscar de novo.
      this.inFlight.delete(key);
    }
  }

  private remember(key: string, window: TextWindow): void {
    this.touch(key, window);

    const isOverLimit = this.cache.size > WindowFetcher.MAX_WINDOWS;
    if (!isOverLimit) return;

    // O Map preserva a ordem de inserção; a primeira chave é a mais antiga.
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey === undefined) return;

    this.cache.delete(oldestKey);
  }

  // delete + set move a chave para o fim da ordem, adiando o descarte (LRU).
  private touch(key: string, window: TextWindow): void {
    this.cache.delete(key);
    this.cache.set(key, window);
  }

  private static toTextWindow(page: ChapterPage): TextWindow {
    return {
      position: page.position,
      offset: page.offset,
      text: page.text,
      nextOffset: page.nextOffset,
      totalLength: page.totalLength,
    };
  }
}
