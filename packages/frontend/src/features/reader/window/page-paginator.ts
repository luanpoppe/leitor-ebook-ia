export interface TextPage {
  /** Índice da página dentro do trecho atual (0-based). */
  index: number;
  /** Offset absoluto no capítulo do primeiro caractere da página (inclusive). */
  startOffset: number;
  /** Offset absoluto no capítulo do primeiro caractere FORA da página (exclusivo). */
  endOffset: number;
  /** Fatia do texto do trecho correspondente à página. */
  text: string;
}

export interface PaginateOptions {
  /** Texto do trecho e seu offset absoluto no capítulo. */
  window: { offset: number; text: string };
  /** Altura útil da página em pixels. */
  pageHeight: number;
  /** Altura em pixels de um pedaço de texto na tipografia atual. */
  measure: (text: string) => number;
}

export class PagePaginator {
  /** Divide o trecho em páginas cuja altura cabe em `pageHeight`. */
  static paginate(options: PaginateOptions): TextPage[] {
    const { window, pageHeight, measure } = options;
    const text = window.text;

    if (text.length === 0) {
      return [
        {
          index: 0,
          startOffset: window.offset,
          endOffset: window.offset,
          text: "",
        },
      ];
    }

    // Medição ainda não pronta (0/NaN) devolve lista vazia; o chamador trata
    // como "repaginar quando a medição ficar válida".
    const probeHeight = measure(text.slice(0, 1));
    const isMeasurementReady = Number.isFinite(probeHeight) && probeHeight > 0;
    if (!isMeasurementReady) return [];

    const pages: TextPage[] = [];
    let cursor = 0;
    // `cursor`/`end` são índices UTF-16 (para fatiar); os offsets da página
    // contam code points, como `window.offset` e `totalLength` do backend.
    let codePointCursor = window.offset;

    while (cursor < text.length) {
      const rawEnd = PagePaginator.findPageEnd(
        text,
        cursor,
        pageHeight,
        measure
      );
      const end = PagePaginator.retreatToCodePointBoundary(
        text,
        cursor,
        rawEnd
      );
      const pageText = text.slice(cursor, end);
      const pageCodePointLength = PagePaginator.countCodePoints(
        text,
        cursor,
        end
      );
      const endCodePoint = codePointCursor + pageCodePointLength;

      pages.push({
        index: pages.length,
        startOffset: codePointCursor,
        endOffset: endCodePoint,
        text: pageText,
      });

      codePointCursor = endCodePoint;
      cursor = end;
    }

    return pages;
  }

  /** Índice da página que contém o offset absoluto, ou null se o trecho não o contém. */
  static findPageIndex(pages: TextPage[], offset: number): number | null {
    if (pages.length === 0) return null;

    const firstPage = pages[0];
    const isBeforeWindow = offset < firstPage.startOffset;
    if (isBeforeWindow) return null;

    const lastIndex = pages.length - 1;
    const lastPage = pages[lastIndex];
    const isPastWindow = offset > lastPage.endOffset;
    if (isPastWindow) return null;

    // O fim do trecho pertence à última página: retomar ali abre a página que
    // contém o último caractere, não uma página inexistente.
    const isWindowEnd = offset === lastPage.endOffset;
    if (isWindowEnd) return lastIndex;

    const pageIndex = pages.findIndex(
      (page) => offset >= page.startOffset && offset < page.endOffset
    );
    if (pageIndex === -1) return null;

    return pageIndex;
  }

  /** Offset de início da página que deve abrir quando o leitor retoma no offset. */
  static resolveStartOffset(pages: TextPage[], offset: number): number | null {
    const pageIndex = PagePaginator.findPageIndex(pages, offset);
    if (pageIndex === null) return null;

    const page = pages[pageIndex];
    return page.startOffset;
  }

  // Devolve o maior `end` (exclusivo) cujo texto `[start, end)` cabe na página.
  private static findPageEnd(
    text: string,
    start: number,
    pageHeight: number,
    measure: (text: string) => number
  ): number {
    const total = text.length;
    const remaining = total - start;

    // O salto exponencial encontra um limite superior conhecido em O(log n)
    // medições; a busca binária refina dentro dele sem medir o trecho inteiro
    // de novo a cada caractere.
    let fittedEnd = start;
    let probeLength = 1;
    let hasOverflowingProbe = false;

    while (probeLength < remaining) {
      const probeEnd = start + probeLength;
      const probeText = text.slice(start, probeEnd);
      const probeHeight = measure(probeText);
      const probeFits = probeHeight <= pageHeight;
      if (!probeFits) {
        hasOverflowingProbe = true;
        break;
      }

      fittedEnd = probeEnd;
      probeLength *= 2;
    }

    // Só quando nenhum probe estourou o resto inteiro pode caber (última
    // página do trecho); medir o sufixo aqui, e não em toda página, evita
    // remedir o texto todo a cada página.
    if (!hasOverflowingProbe) {
      const wholeText = text.slice(start);
      const wholeHeight = measure(wholeText);
      const wholeFits = wholeHeight <= pageHeight;
      if (wholeFits) return total;
    }

    const upperBound = Math.min(start + probeLength, total);

    let lowerGoodEnd = fittedEnd;
    let upperBadEnd = upperBound;

    while (upperBadEnd - lowerGoodEnd > 1) {
      const probeLengthBetween = upperBadEnd - lowerGoodEnd;
      const middleEnd = lowerGoodEnd + Math.floor(probeLengthBetween / 2);
      const middleText = text.slice(start, middleEnd);
      const middleHeight = measure(middleText);
      const middleFits = middleHeight <= pageHeight;

      if (middleFits) {
        lowerGoodEnd = middleEnd;
        continue;
      }

      upperBadEnd = middleEnd;
    }

    const minimumEnd = start + 1;
    const hasProgress = lowerGoodEnd >= minimumEnd;
    if (hasProgress) return lowerGoodEnd;

    // Nenhum pedaço coube: a página recebe 1 caractere para garantir que o
    // cursor sempre avance, mesmo que esse caractere estoure a altura.
    return minimumEnd;
  }

  // Conta code points no intervalo [start, end) sem montar array: um par de
  // surrogates conta como um caractere só, como no offset do backend.
  private static countCodePoints(
    text: string,
    start: number,
    end: number
  ): number {
    let count = 0;
    let index = start;

    while (index < end) {
      count += 1;

      const code = text.charCodeAt(index);
      const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
      const nextCode = index + 1 < end ? text.charCodeAt(index + 1) : 0;
      const isLowSurrogate = nextCode >= 0xdc00 && nextCode <= 0xdfff;
      const isSurrogatePair = isHighSurrogate && isLowSurrogate;

      index += isSurrogatePair ? 2 : 1;
    }

    return count;
  }

  // Cortar entre as metades de um par de surrogates quebraria o emoji; recua
  // um caractere — ou avança um quando recuar deixaria a página vazia.
  private static retreatToCodePointBoundary(
    text: string,
    start: number,
    end: number
  ): number {
    if (end <= start) return end;
    if (end >= text.length) return end;

    const lastCharIndex = end - 1;
    const lastCode = text.charCodeAt(lastCharIndex);
    const isHighSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff;
    if (!isHighSurrogate) return end;

    const nextCode = text.charCodeAt(end);
    const isLowSurrogate = nextCode >= 0xdc00 && nextCode <= 0xdfff;
    if (!isLowSurrogate) return end;

    const retreatedEnd = end - 1;
    const wouldStall = retreatedEnd <= start;
    if (wouldStall) return Math.min(end + 1, text.length);

    return retreatedEnd;
  }
}
