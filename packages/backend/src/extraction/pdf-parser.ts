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
    const pageTexts = await document.readPageTexts();
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

  private buildChapterTexts(
    pageTexts: string[],
    outline: PdfOutlineEntry[],
  ): string[] {
    if (outline.length === 0) {
      return PdfChapterBuilder.fromHeadings(pageTexts);
    }

    const startPages = outline.map((entry) => entry.pageIndex);
    const ranges = PdfOutlinePlanner.planRanges(startPages, pageTexts.length);

    return PdfChapterBuilder.fromRanges(pageTexts, ranges);
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
