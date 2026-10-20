import type { ExtractedChapter } from './content.types';

const SHORT_LINE_MAX_LENGTH = 80;
const DEFAULT_MIN_OCCURRENCES = 3;

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

    return withCollapsedBreaks.trim();
  }

  /**
   * Normaliza os capítulos e descarta os que ficaram vazios, renumerando os
   * restantes para manter a ordem sem buracos.
   */
  static normalizeChapters(chapters: ExtractedChapter[]): ExtractedChapter[] {
    const normalizedChapters = chapters
      .map((chapter) => ({
        position: chapter.position,
        text: TextNormalizer.normalizeText(chapter.text),
      }))
      .filter((chapter) => chapter.text.length > 0);

    return normalizedChapters.map((chapter, index) => ({
      position: index + 1,
      text: chapter.text,
    }));
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
