import {
  PdfOutlinePlanner,
  type PdfChapterRange,
} from './pdf-outline';

const CHAPTER_HEADING_PATTERN =
  /^(cap[íi]tulo|cap\.?|chapter|ch\.?)\s+(\d+|[ivxlcdm]+)\b/i;
const MAX_ISOLATED_TITLE_LENGTH = 60;
const SENTENCE_ENDING_PATTERN = /[.,;:!?]$/;

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

    // Páginas antes do primeiro título reconhecido são capa/sumário e ficam
    // fora, igual ao recorte feito quando existe outline.
    const ranges = PdfOutlinePlanner.planRanges(headingPages, pageTexts.length);
    return PdfChapterBuilder.fromRanges(pageTexts, ranges);
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

  private static isIsolatedTitle(
    firstLine: string,
    lineCount: number,
  ): boolean {
    const hasFollowingContent = lineCount > 1;
    const isShortLine = firstLine.length <= MAX_ISOLATED_TITLE_LENGTH;
    const looksLikeSentence = SENTENCE_ENDING_PATTERN.test(firstLine);

    return hasFollowingContent && isShortLine && !looksLikeSentence;
  }

  private static readMeaningfulLines(pageText: string): string[] {
    const lines = pageText.split('\n').map((line) => line.trim());
    return lines.filter((line) => line.length > 0);
  }
}
