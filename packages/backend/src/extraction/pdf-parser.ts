import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  ContentExtractionError,
  type ExtractedChapter,
  type ExtractionResult,
} from './content.types';
import { PdfChapterBuilder } from './pdf/pdf-chapter-builder';
import { PdfDocument } from './pdf/pdf-document';
import { PdfOutlinePlanner, type PdfOutlineEntry } from './pdf/pdf-outline';
import { TextNormalizer } from './text-normalizer';

const NO_TEXT_MESSAGE = 'PDF sem texto extraível';
const NAVIGATION_TITLE_PATTERN =
  /^(capa|cover|sum[áa]rio|sumario|[íi]ndice|indice|contents|table of contents)\b/i;
const PAGE_MARKER_PREFIX = '\u0000page:';

/**
 * Orquestra a extração de um PDF: abre o documento, decide os capítulos pelo
 * outline (ou por títulos quando não há outline) e entrega texto + metadados.
 */
@Injectable()
export class PdfParser {
  async parse(stream: Readable): Promise<ExtractionResult> {
    const document = await PdfDocument.open(stream);

    try {
      return await this.extract(document);
    } catch (error) {
      if (error instanceof ContentExtractionError) throw error;

      throw new ContentExtractionError(
        'Não foi possível extrair o texto do arquivo PDF.',
      );
    } finally {
      await document.close();
    }
  }

  private async extract(document: PdfDocument): Promise<ExtractionResult> {
    const rawPageTexts = await document.readPageTexts();
    const pageTexts = this.dropRepeatedPageLines(rawPageTexts);
    const hasAnyText = pageTexts.some((text) => text.trim().length > 0);

    if (!hasAnyText) {
      throw new ContentExtractionError(NO_TEXT_MESSAGE);
    }

    const outline = await document.readOutline();
    const chapterTexts = this.buildChapterTexts(pageTexts, outline);
    const chapters = TextNormalizer.normalizeChapters(
      this.toChapters(chapterTexts),
    );

    if (chapters.length === 0) {
      throw new ContentExtractionError(NO_TEXT_MESSAGE);
    }

    const metadata = await document.readMetadata();

    return {
      chapters,
      fullText: this.joinChapters(chapters),
      metadata: { title: metadata.title, author: metadata.author },
    };
  }

  /**
   * Cabeçalho/rodapé repetido entre páginas é removido antes de montar os
   * capítulos; o marcador preserva a página de cada linha no reagrupamento.
   */
  private dropRepeatedPageLines(pageTexts: string[]): string[] {
    const markedLines = pageTexts.flatMap((pageText, pageIndex) => [
      `${PAGE_MARKER_PREFIX}${pageIndex}`,
      ...pageText.split('\n'),
    ]);
    const filteredLines = TextNormalizer.dropRepeatedLines(markedLines);

    return this.regroupPageLines(filteredLines);
  }

  private regroupPageLines(lines: string[]): string[] {
    const pages: string[][] = [];

    for (const line of lines) {
      const isPageMarker = line.startsWith(PAGE_MARKER_PREFIX);

      if (isPageMarker) {
        pages.push([]);
        continue;
      }

      const currentPage = pages[pages.length - 1];
      if (currentPage === undefined) continue;

      currentPage.push(line);
    }

    return pages.map((pageLines) => pageLines.join('\n'));
  }

  private buildChapterTexts(
    pageTexts: string[],
    outline: PdfOutlineEntry[],
  ): string[] {
    const contentOutline = this.discardNavigationEntries(outline);
    if (contentOutline.length === 0) {
      return PdfChapterBuilder.fromHeadings(pageTexts);
    }

    const startPages = contentOutline.map((entry) => entry.pageIndex);
    const ranges = PdfOutlinePlanner.planRanges(startPages, pageTexts.length);

    return PdfChapterBuilder.fromRanges(pageTexts, ranges);
  }

  private discardNavigationEntries(
    outline: PdfOutlineEntry[],
  ): PdfOutlineEntry[] {
    return outline.filter(
      (entry) => !NAVIGATION_TITLE_PATTERN.test(entry.title.trim()),
    );
  }

  private toChapters(chapterTexts: string[]): ExtractedChapter[] {
    return chapterTexts.map((text, index) => ({
      position: index + 1,
      text,
    }));
  }

  private joinChapters(chapters: ExtractedChapter[]): string {
    return chapters.map((chapter) => chapter.text).join('\n\n');
  }
}
