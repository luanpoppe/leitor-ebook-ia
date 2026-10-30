import { PagePaginator } from "./page-paginator";

export interface TextParagraph {
  /** Offset absoluto no capítulo (code points). */
  offset: number;
  text: string;
}

const PARAGRAPH_SEPARATOR = "\n\n";

/**
 * Divide um trecho em parágrafos mantendo o offset absoluto de cada um. O
 * separador entra na conta: sem ele, um parágrafo distante do começo ficaria
 * com offset menor que o mesmo ponto no texto do capítulo.
 */
export class TextParagraphs {
  static split(text: string, baseOffset: number): TextParagraph[] {
    const paragraphs: TextParagraph[] = [];
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
