export interface PdfOutlineEntry {
  title: string;
  pageIndex: number;
}

export interface PdfChapterRange {
  startPage: number;
  endPage: number;
}

/**
 * Converte as páginas de início em faixas contíguas de capítulos. Como o
 * outline já vem achatado na ordem do documento, cada capítulo termina na
 * página anterior ao próximo destino.
 */
export class PdfOutlinePlanner {
  static planRanges(startPages: number[], pageCount: number): PdfChapterRange[] {
    const validStartPages = PdfOutlinePlanner.uniqueStartPages(
      startPages,
      pageCount,
    );

    return validStartPages.map((startPage, index) => {
      const nextStartPage = validStartPages[index + 1];
      const endPage =
        nextStartPage === undefined ? pageCount - 1 : nextStartPage - 1;

      return { startPage, endPage };
    });
  }

  private static uniqueStartPages(
    startPages: number[],
    pageCount: number,
  ): number[] {
    const pagesInRange = startPages.filter(
      (pageIndex) => pageIndex >= 0 && pageIndex < pageCount,
    );
    const uniquePages = [...new Set(pagesInRange)];

    return uniquePages.sort((first, second) => first - second);
  }
}
