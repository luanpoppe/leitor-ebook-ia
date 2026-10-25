import { PagePaginator, type TextPage } from "./page-paginator";
import type { TextWindow } from "./window-types";

export interface PageMetrics {
  pageHeight: number;
  measure: (text: string) => number;
}

/** Onde abrir a leitura depois de carregar um trecho. */
export type PageLanding =
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "offset"; offset: number };

/**
 * Aplica a paginação medida a um trecho e decide qual página abrir. Fica ao
 * lado do `PagePaginator` porque os dois só lidam com a geometria das páginas,
 * sem conhecer rede nem estado de tela.
 */
export class WindowPager {
  /** Divide o trecho em páginas; sem altura útil ainda não há página. */
  static paginate(window: TextWindow, settings: PageMetrics): TextPage[] {
    const hasNoHeight = settings.pageHeight <= 0;
    if (hasNoHeight) return [];

    const pages = PagePaginator.paginate({
      window: { offset: window.offset, text: window.text },
      pageHeight: settings.pageHeight,
      measure: settings.measure,
    });
    return pages;
  }

  /** Índice da página em que a virada deve aterrissar. */
  static resolveLandingIndex(pages: TextPage[], landing: PageLanding): number {
    if (landing.kind === "offset") {
      const pageIndex = PagePaginator.findPageIndex(pages, landing.offset);
      if (pageIndex === null) return 0;
      return pageIndex;
    }

    if (landing.kind === "first") return 0;

    return Math.max(0, pages.length - 1);
  }

  /**
   * Página que contém a âncora; se o offset não existir mais depois de
   * repaginar, cai na última página que começa antes dele.
   */
  static resolveAnchorIndex(pages: TextPage[], anchorOffset: number): number {
    const containingIndex = PagePaginator.findPageIndex(pages, anchorOffset);
    if (containingIndex !== null) return containingIndex;

    const previousPages = pages.filter(
      (page) => page.startOffset <= anchorOffset
    );
    const lastPreviousPage = previousPages[previousPages.length - 1];
    if (!lastPreviousPage) return 0;

    return lastPreviousPage.index;
  }
}
