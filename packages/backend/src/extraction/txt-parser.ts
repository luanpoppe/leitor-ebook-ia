import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  ContentExtractionError,
  type ExtractedChapter,
  type ExtractionResult,
} from './content.types';
import { TextNormalizer } from './text-normalizer';

const MARKDOWN_HEADING = /^#{1,6}\s+\S/;
const CHAPTER_TITLE =
  /^(?:cap[ií]tulo|cap\.?|chapter|ch\.?)\s+(?:\d+|[ivxlcdm]+)\b/i;
const LEADING_DECORATION = /^[\s#*_]+/;
const TRAILING_DECORATION = /[\s#*_]+$/;
const NO_TEXT_MESSAGE = 'O arquivo não contém texto extraível.';

/**
 * Extrai o conteúdo de TXT/Markdown puro. Não há sumário nem metadados no
 * formato, então os capítulos saem dos marcadores de título do próprio texto
 * (headings Markdown e linhas "Capítulo 1"/"Chapter II").
 */
@Injectable()
export class TxtParser {
  async parse(stream: Readable): Promise<ExtractionResult> {
    const buffer = await TxtParser.readStreamToBuffer(stream);
    const rawText = TxtParser.decodeUtf8(buffer);
    const chapterTexts = this.splitIntoChapterTexts(rawText);

    const rawChapters = this.toChapters(chapterTexts);
    const chapters = TextNormalizer.normalizeChapters(rawChapters);

    if (chapters.length === 0) {
      throw new ContentExtractionError(NO_TEXT_MESSAGE);
    }

    return {
      chapters,
      fullText: this.joinChapters(chapters),
      metadata: {},
    };
  }

  /**
   * O texto do marcador não entra no capítulo: ele só delimita onde o capítulo
   * começa. O que vem antes do primeiro marcador é sumário/front matter e é
   * descartado.
   */
  private splitIntoChapterTexts(rawText: string): string[] {
    const lines = rawText.split('\n');
    const chapterTexts: string[] = [];
    let currentChapterLines: string[] = [];
    let foundMarker = false;

    for (const line of lines) {
      const isMarker = TxtParser.isChapterMarker(line);

      if (!isMarker) {
        if (foundMarker) currentChapterLines.push(line);
        continue;
      }

      if (foundMarker) {
        this.pushChapter(currentChapterLines, chapterTexts);
      }

      foundMarker = true;
      currentChapterLines = [];
    }

    if (foundMarker) this.pushChapter(currentChapterLines, chapterTexts);

    return foundMarker ? chapterTexts : [rawText];
  }

  private static isChapterMarker(line: string): boolean {
    const trimmedLine = line.trim();

    if (MARKDOWN_HEADING.test(trimmedLine)) return true;

    const lineWithoutDecoration = TxtParser.stripDecoration(trimmedLine);
    return CHAPTER_TITLE.test(lineWithoutDecoration);
  }

  private static stripDecoration(line: string): string {
    const withoutLeading = line.replace(LEADING_DECORATION, '');
    return withoutLeading.replace(TRAILING_DECORATION, '');
  }

  private pushChapter(lines: string[], chapterTexts: string[]): void {
    const chapterText = lines.join('\n');
    const normalizedText = TextNormalizer.normalizeText(chapterText);

    if (normalizedText.length === 0) return;

    chapterTexts.push(normalizedText);
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

  private static decodeUtf8(buffer: Buffer): string {
    return buffer.toString('utf8').replace(/^\uFEFF/, '');
  }

  private static async readStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      const chunkValue: unknown = chunk;
      const chunkBuffer = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue as Uint8Array);
      chunks.push(chunkBuffer);
    }

    return Buffer.concat(chunks);
  }
}
