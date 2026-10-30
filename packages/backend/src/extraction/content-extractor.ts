import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { BookFormat } from '../generated/prisma/client';
import { FileStorageService } from '../storage/file-storage.service';
import {
  ContentExtractionError,
  type ExtractedChapter,
  type ExtractedCover,
  type ExtractionInput,
  type ExtractionResult,
} from './content.types';
import { ChapterSeparatorDetector } from './chapter-separator.detector';
import { EpubParser } from './epub-parser';
import { PdfParser } from './pdf-parser';
import { StreamUtils } from './stream-utils';
import { TextNormalizer } from './text-normalizer';
import { TxtParser } from './txt-parser';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_SIZE_MESSAGE =
  'A capa do livro excede o limite de tamanho suportado.';
// Só vale consultar a IA quando o livro é grande o bastante para ter capítulos
// e a divisão padrão deixou poucos capítulos ou capítulos gigantes.
const MIN_TEXT_FOR_DETECTION = 50_000;
const MAX_AVERAGE_CHAPTER_LENGTH = 60_000;

export interface ExtractedContent {
  chapters: ExtractedChapter[];
  fullText: string;
  metadata: {
    title?: string;
    author?: string;
  };
  coverStorageKey?: string;
}

interface BookParser {
  parse(stream: Readable): Promise<ExtractionResult>;
}

/**
 * Ponto único de extração: escolhe o parser pelo formato do arquivo, grava a
 * capa no storage (quando existir) e devolve o conteúdo pronto para a ingestão.
 */
@Injectable()
export class ContentExtractor {
  private readonly logger = new Logger(ContentExtractor.name);

  constructor(
    private readonly epubParser: EpubParser,
    private readonly pdfParser: PdfParser,
    private readonly txtParser: TxtParser,
    private readonly separatorDetector: ChapterSeparatorDetector,
    private readonly storage: FileStorageService,
  ) {}

  async extract(
    input: ExtractionInput,
    options: { persistCover?: boolean } = {},
  ): Promise<ExtractedContent> {
    this.logger.log(`Iniciando extração de conteúdo: formato=${input.format}`);

    const parser = this.selectParser(input.format);
    const result = await parser.parse(input.stream);
    const chapters = await this.resolveChapters(result.chapters, result.fullText);
    const hasCover = result.metadata.cover !== undefined;

    this.logger.log(
      `Conteúdo extraído: formato=${input.format}, capítulos=${chapters.length}, capa=${hasCover ? 'sim' : 'não'}`,
    );

    // O backfill de títulos só reaproveita o texto, então não precisa reenviar
    // a capa para o storage.
    const shouldPersistCover = options.persistCover !== false;
    const coverStorageKey = shouldPersistCover
      ? await this.storeCover(result.metadata.cover)
      : undefined;

    return {
      chapters,
      fullText: result.fullText,
      metadata: {
        title: result.metadata.title,
        author: result.metadata.author,
      },
      coverStorageKey,
    };
  }

  /**
   * Só consulta a IA quando a divisão padrão parece ter falhado. O padrão
   * devolvido é validado contra a amostra; se não render pelo menos dois
   * capítulos novos, a divisão original fica.
   */
  private async resolveChapters(
    chapters: ExtractedChapter[],
    fullText: string,
  ): Promise<ExtractedChapter[]> {
    if (!this.shouldDetectSeparator(chapters, fullText)) return chapters;

    const detected = await this.separatorDetector.detect(fullText);
    if (detected === null) return chapters;

    const splitChapters = TextNormalizer.splitByRegex(
      chapters,
      detected.regex,
    );
    const hasEnoughNewChapters = splitChapters.length >= chapters.length + 2;
    if (!hasEnoughNewChapters) return chapters;

    this.logger.log(
      `Separação por IA aplicada: ${chapters.length} → ${splitChapters.length} capítulos (padrão ${detected.pattern}).`,
    );

    return splitChapters.map((chapter, index) => ({
      ...chapter,
      position: index + 1,
    }));
  }

  private shouldDetectSeparator(
    chapters: ExtractedChapter[],
    fullText: string,
  ): boolean {
    if (fullText.length < MIN_TEXT_FOR_DETECTION) return false;
    if (chapters.length === 0) return true;

    const totalLength = chapters.reduce(
      (sum, chapter) => sum + chapter.text.length,
      0,
    );
    const averageLength = totalLength / chapters.length;
    const hasTooFewChapters = chapters.length <= 2;
    const hasHugeChapters = averageLength > MAX_AVERAGE_CHAPTER_LENGTH;

    return hasTooFewChapters || hasHugeChapters;
  }

  /**
   * TXT e Markdown compartilham o mesmo parser; qualquer outro formato que
   * chegue aqui não tem extrator previsto.
   */
  private selectParser(format: BookFormat): BookParser {
    const parserByFormat = this.buildParserByFormat();
    const parser = parserByFormat[format];

    if (!parser) {
      throw new ContentExtractionError(
        `Formato de ebook não suportado para extração: "${format}".`,
      );
    }

    return parser;
  }

  private buildParserByFormat(): Partial<Record<BookFormat, BookParser>> {
    return {
      EPUB: this.epubParser,
      PDF: this.pdfParser,
      TXT: this.txtParser,
      MD: this.txtParser,
    };
  }

  private async storeCover(
    cover: ExtractedCover | undefined,
  ): Promise<string | undefined> {
    if (!cover) return undefined;

    const coverBuffer = await StreamUtils.readToBuffer(
      cover.stream,
      MAX_COVER_BYTES,
      COVER_SIZE_MESSAGE,
    );
    const storageKey = `covers/${cover.hash}.${cover.extension}`;
    const coverStream = Readable.from(coverBuffer);

    this.logger.log(
      `Gravando capa no storage: ${storageKey} (${coverBuffer.length} bytes, ${cover.contentType})`,
    );

    return this.storage.putObject({
      storageKey,
      contentType: cover.contentType,
      stream: coverStream,
      size: coverBuffer.length,
    });
  }
}
