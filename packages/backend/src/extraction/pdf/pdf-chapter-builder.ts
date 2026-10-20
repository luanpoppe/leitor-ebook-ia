import {
  PdfOutlinePlanner,
  type PdfChapterRange,
} from './pdf-outline';

const CHAPTER_HEADING_PATTERN =
  /^(cap[íi]tulo|cap\.?|chapter|ch\.?)\s+(\d+|[ivxlcdm]+)\b/i;
const MAX_ISOLATED_TITLE_LENGTH = 60;
const SENTENCE_ENDING_PATTERN = /[.,;:!?]$/;
const LEADING_DIALOGUE_PATTERN = /^[—–\-"“]/;
const LETTER_PATTERN = /\p{L}/u;
const WORD_SEPARATOR = /\s+/;
const TITLE_CASE_MAX_WORDS = 8;
const UPPERCASE_RATIO = 0.6;
const TITLE_CASE_MIN_CAPITALIZED_RATIO = 0.5;

/**
 * Monta o texto dos capítulos a partir das páginas. Quando existe outline, as
 * faixas mandam; sem outline, tenta reconhecer títulos no início das páginas.
 */
export class PdfChapterBuilder {
  static fromRanges(
    pageTexts: string[],
    ranges: PdfChapterRange[],
  ): string[] {
    return ranges.map((range) => {
      const chapterPages = pageTexts.slice(range.startPage, range.endPage + 1);
      return chapterPages.join('\n\n');
    });
  }

  static fromHeadings(pageTexts: string[]): string[] {
    const headingPages = PdfChapterBuilder.findHeadingPages(pageTexts);

    if (headingPages.length === 0) {
      return [pageTexts.join('\n\n')];
    }

    const ranges = PdfChapterBuilder.buildRanges(headingPages, pageTexts);
    return PdfChapterBuilder.fromRanges(pageTexts, ranges);
  }

  /**
   * Páginas antes do primeiro título reconhecido viram um capítulo inicial em
   * vez de serem descartadas: podem ser capa/sumário, mas nada some em silêncio.
   */
  private static buildRanges(
    headingPages: number[],
    pageTexts: string[],
  ): PdfChapterRange[] {
    const titleRanges = PdfOutlinePlanner.planRanges(
      headingPages,
      pageTexts.length,
    );
    const firstHeadingPage = headingPages[0];

    if (firstHeadingPage === undefined || firstHeadingPage === 0) {
      return titleRanges;
    }

    const initialPages = pageTexts.slice(0, firstHeadingPage);
    const hasInitialText = initialPages.some(
      (pageText) => pageText.trim().length > 0,
    );

    if (!hasInitialText) return titleRanges;

    return [{ startPage: 0, endPage: firstHeadingPage - 1 }, ...titleRanges];
  }

  private static findHeadingPages(pageTexts: string[]): number[] {
    const headingPages: number[] = [];

    pageTexts.forEach((pageText, pageIndex) => {
      if (PdfChapterBuilder.isChapterStart(pageText)) {
        headingPages.push(pageIndex);
      }
    });

    return headingPages;
  }

  private static isChapterStart(pageText: string): boolean {
    const lines = PdfChapterBuilder.readMeaningfulLines(pageText);
    const firstLine = lines[0];

    if (firstLine === undefined) return false;
    if (CHAPTER_HEADING_PATTERN.test(firstLine)) return true;

    return PdfChapterBuilder.isIsolatedTitle(firstLine, lines.length);
  }

  /**
   * Título isolado não é linha de prosa: precisa ser curto, não terminar como
   * frase, não abrir diálogo e estar em caixa alta ou em Title Case.
   */
  private static isIsolatedTitle(
    firstLine: string,
    lineCount: number,
  ): boolean {
    const hasFollowingContent = lineCount > 1;
    const isShortLine = firstLine.length <= MAX_ISOLATED_TITLE_LENGTH;
    const looksLikeSentence = SENTENCE_ENDING_PATTERN.test(firstLine);
    const startsWithDialogue = LEADING_DIALOGUE_PATTERN.test(firstLine);

    if (!hasFollowingContent) return false;
    if (!isShortLine) return false;
    if (looksLikeSentence) return false;
    if (startsWithDialogue) return false;

    const isUppercaseTitle = PdfChapterBuilder.isMostlyUppercase(firstLine);
    const isTitleCaseTitle = PdfChapterBuilder.isTitleCase(firstLine);

    return isUppercaseTitle || isTitleCaseTitle;
  }

  private static isMostlyUppercase(line: string): boolean {
    const letters = line.match(/\p{L}/gu) ?? [];
    if (letters.length === 0) return false;

    const uppercaseCount = letters.filter(
      (letter) => letter === letter.toUpperCase(),
    ).length;
    const uppercaseRatio = uppercaseCount / letters.length;

    return uppercaseRatio >= UPPERCASE_RATIO;
  }

  private static isTitleCase(line: string): boolean {
    const words = line.split(WORD_SEPARATOR).filter((word) => word.length > 0);
    const firstWord = words[0];

    if (firstWord === undefined) return false;
    if (words.length > TITLE_CASE_MAX_WORDS) return false;
    if (!PdfChapterBuilder.startsWithUppercase(firstWord)) return false;

    const capitalizedCount = words.filter((word) =>
      PdfChapterBuilder.startsWithUppercase(word),
    ).length;
    const capitalizedRatio = capitalizedCount / words.length;

    return capitalizedRatio >= TITLE_CASE_MIN_CAPITALIZED_RATIO;
  }

  private static startsWithUppercase(word: string): boolean {
    const firstCharacter = word.charAt(0);
    if (!LETTER_PATTERN.test(firstCharacter)) return false;

    return firstCharacter === firstCharacter.toUpperCase();
  }

  private static readMeaningfulLines(pageText: string): string[] {
    const lines = pageText.split('\n').map((line) => line.trim());
    return lines.filter((line) => line.length > 0);
  }
}
