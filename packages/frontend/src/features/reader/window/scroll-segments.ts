import { PagePaginator } from "./page-paginator";
import type { TextWindow } from "./window-types";

export interface ScrollParagraph {
  /** Offset absoluto no capítulo (code points). */
  offset: number;
  text: string;
}

export interface ScrollSegment {
  /** `${position}:${offset}` — estável para o React. */
  key: string;
  position: number;
  offset: number;
  paragraphs: ScrollParagraph[];
  /** Próximo offset dentro do mesmo capítulo, ou null no fim dele. */
  nextOffset: number | null;
  totalLength: number;
  /** Último caractere do texto: `"\n"` avisa que a janela fechou um parágrafo. */
  lastChar: string;
}

const PARAGRAPH_SEPARATOR = "\n\n";

/**
 * Matemática dos trechos da rolagem: divide uma janela em parágrafos com offset
 * absoluto e resolve a ordem entre capítulos. Fica fora do hook porque não
 * depende de React nem de rede.
 */
export class ScrollSegments {
  static fromWindow(textWindow: TextWindow): ScrollSegment {
    // O próximo trecho só existe se a janela não fechou o capítulo: nesse caso,
    // corta o fim no último espaço para a palavra partida não aparecer na
    // emenda entre trechos.
    const hasNextWindow = textWindow.nextOffset !== null;
    const text = hasNextWindow
      ? trimTrailingPartialWord(textWindow.text)
      : textWindow.text;
    const didTrim = text.length !== textWindow.text.length;
    const trimmedCodePoints = didTrim
      ? countCodePoints(text)
      : 0;

    return {
      key: `${textWindow.position}:${textWindow.offset}`,
      position: textWindow.position,
      offset: textWindow.offset,
      paragraphs: ScrollSegments.toParagraphs(text, textWindow.offset),
      nextOffset: didTrim
        ? textWindow.offset + trimmedCodePoints
        : textWindow.nextOffset,
      totalLength: textWindow.totalLength,
      lastChar: ScrollSegments.resolveLastChar(text),
    };
  }

  /** Offset do fim do trecho, em code points. */
  static endOffset(segment: ScrollSegment): number {
    const last = segment.paragraphs[segment.paragraphs.length - 1];
    if (last === undefined) return segment.offset;

    return last.offset + countCodePoints(last.text);
  }

  /**
   * O trecho preposto não pode reescrever texto que já está na tela: ele é
   * cortado para terminar exatamente onde o primeiro trecho começa.
   */
  static trimEnd(
    segment: ScrollSegment,
    endOffset: number
  ): ScrollSegment {
    const isAlreadyShort = ScrollSegments.endOffset(segment) <= endOffset;
    if (isAlreadyShort) return segment;

    const paragraphs: ScrollParagraph[] = [];
    for (const paragraph of segment.paragraphs) {
      const availableLength = endOffset - paragraph.offset;
      if (availableLength <= 0) break;

      const paragraphLength = countCodePoints(paragraph.text);
      const fitsEntirely = paragraphLength <= availableLength;
      const text = fitsEntirely
        ? paragraph.text
        : sliceByCodePoints(paragraph.text, availableLength);
      paragraphs.push({ offset: paragraph.offset, text });
      if (!fitsEntirely) break;
    }

    const lastParagraph = paragraphs[paragraphs.length - 1];
    return {
      ...segment,
      paragraphs,
      nextOffset: endOffset,
      // O corte muda onde o trecho termina: o sinal de parágrafo aberto tem
      // que vir do texto que sobrou, não do fim da janela original.
      lastChar:
        lastParagraph === undefined
          ? ""
          : ScrollSegments.resolveLastChar(lastParagraph.text),
    };
  }

  static findNextPosition(
    chapterPositions: number[],
    position: number
  ): number | null {
    const next = chapterPositions.find((candidate) => candidate > position);
    return next ?? null;
  }

  static findPreviousPosition(
    chapterPositions: number[],
    position: number
  ): number | null {
    const earlier = chapterPositions.filter(
      (candidate) => candidate < position
    );
    const previous = earlier[earlier.length - 1];
    return previous ?? null;
  }

  private static resolveLastChar(text: string): string {
    if (text.length === 0) return "";

    const codePoints = Array.from(text);
    return codePoints[codePoints.length - 1] ?? "";
  }

  // Divide por `\n\n` somando também o separador: sem ele, o offset de um
  // parágrafo distante do começo ficaria menor que o do mesmo ponto no backend.
  private static toParagraphs(
    text: string,
    baseOffset: number
  ): ScrollParagraph[] {
    const paragraphs: ScrollParagraph[] = [];
    let codePointOffset = baseOffset;
    let cursor = 0;

    while (cursor <= text.length) {
      const separatorIndex = text.indexOf(PARAGRAPH_SEPARATOR, cursor);
      const blockEnd = separatorIndex === -1 ? text.length : separatorIndex;
      const block = text.slice(cursor, blockEnd);

      if (block.length > 0) {
        paragraphs.push({ offset: codePointOffset, text: block });
      }

      codePointOffset += PagePaginator.countCodePoints(text, cursor, blockEnd);
      if (separatorIndex === -1) break;

      codePointOffset += PARAGRAPH_SEPARATOR.length;
      cursor = blockEnd + PARAGRAPH_SEPARATOR.length;
    }

    return paragraphs;
  }
}

function countCodePoints(text: string): number {
  return PagePaginator.countCodePoints(text, 0, text.length);
}

// A janela corta em 20 mil caracteres, sem respeitar palavras. Recua até depois
// do último espaço para a palavra inteira ir para o trecho seguinte. O limite
// evita empurrar adiante um "token" gigante (URL, sequência sem espaço).
const MAX_TRIMMED_WORD_LENGTH = 80;

function trimTrailingPartialWord(text: string): string {
  const lastWhitespaceIndex = findLastWhitespaceIndex(text);
  if (lastWhitespaceIndex === -1) return text;

  const endsWithWhitespace = lastWhitespaceIndex === text.length - 1;
  if (endsWithWhitespace) return text;

  const partialWordLength = text.length - lastWhitespaceIndex - 1;
  const isGiantToken = partialWordLength > MAX_TRIMMED_WORD_LENGTH;
  if (isGiantToken) return text;

  return text.slice(0, lastWhitespaceIndex + 1);
}

function findLastWhitespaceIndex(text: string): number {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index];
    const isWhitespace =
      char === " " || char === "\n" || char === "\r" || char === "\t";
    if (isWhitespace) return index;
  }

  return -1;
}

function sliceByCodePoints(text: string, length: number): string {
  const codePoints = Array.from(text);
  return codePoints.slice(0, length).join("");
}
