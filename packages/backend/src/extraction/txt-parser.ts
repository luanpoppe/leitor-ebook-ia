import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  ContentExtractionError,
  type ExtractedChapter,
  type ExtractionResult,
} from './content.types';
import { StreamUtils } from './stream-utils';
import { TextNormalizer } from './text-normalizer';

const MARKDOWN_HEADING = /^#{1,6}\s+\S/;
const CHAPTER_TITLE =
  /^(?:cap[ií]tulo|cap\.?|chapter|ch\.?)\s+(?:\d+|[ivxlcdm]+)\b/i;
const LEADING_DECORATION = /^[\s#*_]+/;
const TRAILING_DECORATION = /[\s#*_]+$/;
const FENCE_DELIMITER = /^(?:```|~~~)/;
const NO_TEXT_MESSAGE = 'O arquivo não contém texto extraível.';
const MAX_TXT_BYTES = 64 * 1024 * 1024;
const TXT_SIZE_MESSAGE = 'Arquivo de texto maior que o limite suportado.';

interface TxtChapterDraft {
  title: string | null;
  text: string;
}

/**
 * Extrai o conteúdo de TXT/Markdown puro. Não há sumário nem metadados no
 * formato, então os capítulos saem dos marcadores de título do próprio texto
 * (headings Markdown e linhas "Capítulo 1"/"Chapter II").
 */
@Injectable()
export class TxtParser {
  async parse(stream: Readable): Promise<ExtractionResult> {
    const buffer = await StreamUtils.readToBuffer(
      stream,
      MAX_TXT_BYTES,
      TXT_SIZE_MESSAGE,
    );
    const rawText = TxtParser.decodeText(buffer);
    const chapterDrafts = this.splitIntoChapterTexts(rawText);

    const rawChapters = this.toChapters(chapterDrafts);
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
   * começa e vira o título do capítulo aberto por ele. O que vem antes do
   * primeiro marcador é sumário/front matter e é descartado. Linhas dentro de
   * bloco cercado (```/~~~) são código, não título.
   */
  private splitIntoChapterTexts(rawText: string): TxtChapterDraft[] {
    const lines = rawText.split('\n');
    const chapterDrafts: TxtChapterDraft[] = [];
    let currentChapterLines: string[] = [];
    let currentTitle: string | null = null;
    let foundMarker = false;
    let insideFence = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      const isFenceDelimiter = FENCE_DELIMITER.test(trimmedLine);

      if (isFenceDelimiter) {
        insideFence = !insideFence;
        if (foundMarker) currentChapterLines.push(line);
        continue;
      }

      const isMarker = !insideFence && TxtParser.isChapterMarker(line);

      if (!isMarker) {
        if (foundMarker) currentChapterLines.push(line);
        continue;
      }

      if (foundMarker) {
        this.pushChapter(currentTitle, currentChapterLines, chapterDrafts);
      }

      foundMarker = true;
      currentTitle = TxtParser.extractMarkerTitle(line);
      currentChapterLines = [];
    }

    if (foundMarker) {
      this.pushChapter(currentTitle, currentChapterLines, chapterDrafts);
    }

    return foundMarker ? chapterDrafts : [{ title: null, text: rawText }];
  }

  private static extractMarkerTitle(line: string): string | null {
    const title = TxtParser.stripDecoration(line.trim());

    return title.length > 0 ? title : null;
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

  private pushChapter(
    title: string | null,
    lines: string[],
    chapterDrafts: TxtChapterDraft[],
  ): void {
    const chapterText = lines.join('\n');
    const normalizedText = TextNormalizer.normalizeText(chapterText);

    if (normalizedText.length === 0) return;

    chapterDrafts.push({ title, text: normalizedText });
  }

  private toChapters(chapterDrafts: TxtChapterDraft[]): ExtractedChapter[] {
    return chapterDrafts.map((draft, index) => ({
      position: index + 1,
      title: draft.title,
      text: draft.text,
    }));
  }

  private joinChapters(chapters: ExtractedChapter[]): string {
    return chapters.map((chapter) => chapter.text).join('\n\n');
  }

  private static decodeText(buffer: Buffer): string {
    const text = TxtParser.decodeBuffer(buffer);

    return text.replace(/^\uFEFF/, '');
  }

  /**
   * UTF-16 é reconhecido pelo BOM; sem BOM, tenta UTF-8 e cai para latin1
   * quando aparecem caracteres de substituição (comum em acervo antigo).
   */
  private static decodeBuffer(buffer: Buffer): string {
    const isLittleEndianBom = buffer[0] === 0xff && buffer[1] === 0xfe;
    if (isLittleEndianBom) return buffer.toString('utf16le');

    const isBigEndianBom = buffer[0] === 0xfe && buffer[1] === 0xff;
    if (isBigEndianBom) return TxtParser.decodeBigEndianUtf16(buffer);

    const utf8Text = buffer.toString('utf8');
    const hasReplacementChar = utf8Text.includes('\uFFFD');
    return hasReplacementChar ? buffer.toString('latin1') : utf8Text;
  }

  private static decodeBigEndianUtf16(buffer: Buffer): string {
    const evenLength = buffer.length - (buffer.length % 2);
    const swapped = Buffer.from(buffer.subarray(0, evenLength));
    swapped.swap16();

    return swapped.toString('utf16le');
  }
}
