import { ChapterTitle } from './chapter-title';
import type { ExtractedChapter } from './content.types';

const SHORT_LINE_MAX_LENGTH = 80;
const DEFAULT_MIN_OCCURRENCES = 3;
const CHAPTER_HEADING_PATTERN =
  /^(CAPÍTULO|CAPITULO|CHAPTER|PARTE|PART)\s+(\d+|[IVXLCDM]+)\s*$/i;
const NAMED_HEADING_PATTERN =
  /^(PRÓLOGO|PROLOGO|EPÍLOGO|EPILOGO|AGRADECIMENTOS|NOTAS DA TRADUTORA|APÊNDICE|APENDICE)\s*$/i;
const MAX_TITLE_LENGTH = 70;

export class TextNormalizer {
  /**
   * Limpa o lixo de layout gerado por extratores (principalmente PDF) sem
   * alterar o conteúdo semântico do texto.
   */
  static normalizeText(raw: string): string {
    const withUnifiedLineBreaks = raw.replace(/\r\n?/g, '\n');

    // A hifenização é desfeita antes de colapsar os espaços: se a quebra de
    // linha virasse espaço primeiro, "pala-\nvra" terminaria como "pala- vra".
    const withoutHyphenation = withUnifiedLineBreaks.replace(
      /([\p{L}])-\n[ \t]*/gu,
      '$1',
    );

    const withCollapsedSpaces = withoutHyphenation.replace(/[ \t]+/g, ' ');
    const withTrimmedLines = withCollapsedSpaces.replace(/[ \t]*\n[ \t]*/g, '\n');
    const withCollapsedBreaks = withTrimmedLines.replace(/\n{3,}/g, '\n\n');
    const withoutPageNumbers =
      TextNormalizer.stripPageNumberArtifacts(withCollapsedBreaks);

    return withoutPageNumbers.trim();
  }

  /**
   * Remove números de página que o EPUB/PDF deixa no meio do texto, como
   * "6 9 6" (dígitos separados por espaço). Só pega sequências de 3+ grupos de
   * 1–2 dígitos, então "1 000" e "1 234" (números reais) ficam intactos.
   * Número no fim de um parágrafo também rejunta a frase partida ao parágrafo
   * seguinte, que era o efeito da quebra de página no meio da frase.
   */
  static stripPageNumberArtifacts(text: string): string {
    // (?<![\d.,]) evita cortar um pedaço de número maior.
    const token = String.raw`(?<![\d.,])\d{1,2}(?: \d{1,2}){2,}(?![\d.,])`;
    let result = text;

    // Parágrafo que é só o número de página.
    result = result.replace(new RegExp(`\\n\\n *${token} *\\n\\n`, 'g'), '\n\n');
    result = result.replace(new RegExp(`^ *${token} *\\n\\n`, 'g'), '');
    result = result.replace(new RegExp(`\\n\\n *${token} *$`, 'g'), '');

    // Número no começo do parágrafo, antes do texto.
    result = result.replace(new RegExp(`\\n\\n *${token} +`, 'g'), '\n\n');
    result = result.replace(new RegExp(`^ *${token} +`, 'g'), '');

    // Número no fim do parágrafo: a frase continua no parágrafo seguinte.
    result = result.replace(new RegExp(` *${token} *\\n\\n`, 'g'), ' ');

    // Sobrou no meio de um parágrafo: só remove o número.
    result = result.replace(new RegExp(` *${token} *`, 'g'), ' ');

    return result.replace(/ {2,}/g, ' ').replace(/ *\n/g, '\n');
  }

  /**
   * Normaliza os capítulos e descarta os que ficaram vazios, renumerando os
   * restantes para manter a ordem sem buracos. Depois divide cada capítulo nos
   * títulos "CAPÍTULO N" que ficaram como texto (EPUBs sem tag de heading).
   */
  static normalizeChapters(chapters: ExtractedChapter[]): ExtractedChapter[] {
    const normalizedChapters = chapters.flatMap((chapter) => {
      const normalizedText = TextNormalizer.normalizeText(chapter.text);
      if (normalizedText.length === 0) return [];

      return TextNormalizer.splitByHeadings({
        position: chapter.position,
        title: ChapterTitle.normalize(chapter.title),
        text: normalizedText,
      });
    });

    return normalizedChapters
      .filter((chapter) => chapter.text.trim().length > 0)
      .map((chapter, index) => ({
        position: index + 1,
        title: ChapterTitle.normalize(chapter.title),
        text: chapter.text,
      }));
  }

  /**
   * Um arquivo do EPUB pode conter vários capítulos. O título vem como um
   * parágrafo "CAPÍTULO 63" (às vezes seguido do nome do capítulo), então o
   * texto é cortado nesses parágrafos. O heading continua no texto para o
   * leitor poder destacá-lo.
   */
  static splitByHeadings(chapter: ExtractedChapter): ExtractedChapter[] {
    return TextNormalizer.splitChapter(chapter, (text) =>
      TextNormalizer.isHeadingParagraph(text),
    );
  }

  /** Mesma divisão, com o padrão de título aprendido do próprio livro. */
  static splitByRegex(
    chapters: ExtractedChapter[],
    regex: RegExp,
  ): ExtractedChapter[] {
    return chapters.flatMap((chapter) =>
      TextNormalizer.splitChapter(chapter, (text) => regex.test(text)),
    );
  }

  private static splitChapter(
    chapter: ExtractedChapter,
    isHeading: (text: string) => boolean,
  ): ExtractedChapter[] {
    const paragraphs = chapter.text.split('\n\n');
    const segments: ExtractedChapter[] = [];
    let currentTitle = chapter.title;
    let currentParagraphs: string[] = [];

    const flush = (): void => {
      const hasContent = currentParagraphs.some(
        (paragraph) => paragraph.trim().length > 0,
      );
      if (!hasContent) return;

      segments.push({
        position: segments.length + 1,
        title: currentTitle,
        text: currentParagraphs.join('\n\n'),
      });
    };

    for (const [index, paragraph] of paragraphs.entries()) {
      const headingText = paragraph.trim();
      if (!isHeading(headingText)) {
        currentParagraphs.push(paragraph);
        continue;
      }

      flush();

      const nextParagraph = paragraphs[index + 1]?.trim() ?? '';
      const isSubtitle =
        nextParagraph.length > 0 &&
        nextParagraph.length <= MAX_TITLE_LENGTH &&
        !/[.!?]$/.test(nextParagraph) &&
        !TextNormalizer.isHeadingParagraph(nextParagraph);
      currentTitle = isSubtitle
        ? `${headingText} — ${nextParagraph}`
        : headingText;
      currentParagraphs = [paragraph];
    }

    flush();

    return segments;
  }

  /** Título de capítulo que ficou como parágrafo no texto do EPUB. */
  static isHeadingParagraph(text: string): boolean {
    return (
      CHAPTER_HEADING_PATTERN.test(text) || NAMED_HEADING_PATTERN.test(text)
    );
  }

  /**
   * Remove cabeçalhos/rodapés repetidos entre páginas de PDF. Linhas longas e
   * linhas vazias são preservadas: a primeira costuma ser conteúdo real e a
   * segunda separa parágrafos.
   */
  static dropRepeatedLines(
    lines: string[],
    options: { minOccurrences?: number } = {},
  ): string[] {
    const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
    const occurrencesByLine = TextNormalizer.countShortLineOccurrences(lines);

    return lines.filter((line) => {
      const lineContent = line.trim();
      if (lineContent.length === 0) return true;

      const isShortLine = lineContent.length <= SHORT_LINE_MAX_LENGTH;
      if (!isShortLine) return true;

      const occurrences = occurrencesByLine.get(lineContent) ?? 0;
      return occurrences < minOccurrences;
    });
  }

  private static countShortLineOccurrences(lines: string[]): Map<string, number> {
    const occurrences = new Map<string, number>();

    for (const line of lines) {
      const lineContent = line.trim();
      if (lineContent.length === 0) continue;

      const isShortLine = lineContent.length <= SHORT_LINE_MAX_LENGTH;
      if (!isShortLine) continue;

      const currentOccurrences = occurrences.get(lineContent) ?? 0;
      occurrences.set(lineContent, currentOccurrences + 1);
    }

    return occurrences;
  }
}
