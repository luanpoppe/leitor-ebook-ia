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
import { EpubParser } from './epub-parser';
import { PdfParser } from './pdf-parser';
import { StreamUtils } from './stream-utils';
import { TxtParser } from './txt-parser';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_SIZE_MESSAGE =
  'A capa do livro excede o limite de tamanho suportado.';

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
    private readonly storage: FileStorageService,
  ) {}

  async extract(input: ExtractionInput): Promise<ExtractedContent> {
    this.logger.log(`Iniciando extração de conteúdo: formato=${input.format}`);

    const parser = this.selectParser(input.format);
    const result = await parser.parse(input.stream);
    const hasCover = result.metadata.cover !== undefined;

    this.logger.log(
      `Conteúdo extraído: formato=${input.format}, capítulos=${result.chapters.length}, capa=${hasCover ? 'sim' : 'não'}`,
    );

    const coverStorageKey = await this.storeCover(result.metadata.cover);

    return {
      chapters: result.chapters,
      fullText: result.fullText,
      metadata: {
        title: result.metadata.title,
        author: result.metadata.author,
      },
      coverStorageKey,
    };
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
