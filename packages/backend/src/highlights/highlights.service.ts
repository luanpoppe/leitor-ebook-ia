import { Injectable, Logger } from '@nestjs/common';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { Highlight } from '../generated/prisma/client';
import {
  HighlightNotFoundError,
  HighlightOverlapError,
  InvalidHighlightChapterError,
  InvalidHighlightRangeError,
} from './highlights.errors';
import {
  HighlightColorMapper,
  HighlightsRepository,
  type CreateHighlightRecord,
} from './highlights.repository';
import {
  MAX_HIGHLIGHT_QUOTE_LENGTH,
  type CreateHighlightInput,
  type HighlightColorValue,
  type HighlightListWithBooksResponse,
  type HighlightResponse,
  type UpdateHighlightInput,
} from './highlights.schemas';

export interface HighlightListFilter {
  query?: string;
  color?: HighlightColorValue;
}

/**
 * Regras das marcações de texto: o trecho precisa existir no capítulo do livro
 * e não pode se sobrepor a outra marcação já salva.
 */
@Injectable()
export class HighlightsService {
  private readonly logger = new Logger(HighlightsService.name);

  constructor(
    private readonly highlights: HighlightsRepository,
    private readonly ebooks: EbookRepository,
  ) {}

  async list(
    bookId: string,
    filter: HighlightListFilter = {},
  ): Promise<HighlightResponse[]> {
    await this.requireBook(bookId);
    const items = await this.highlights.list(bookId, {
      query: filter.query,
      color: this.toRecordColor(filter.color),
    });

    return items.map((highlight) => this.toResponse(highlight));
  }

  /** Todas as marcações da biblioteca, com o livro de cada uma. */
  async listAll(
    filter: HighlightListFilter = {},
    bookId?: string,
    limit?: number,
  ): Promise<HighlightListWithBooksResponse> {
    const items = await this.highlights.listAll(
      {
        query: filter.query,
        color: this.toRecordColor(filter.color),
      },
      bookId,
      limit,
    );

    return {
      items: items.map((highlight) => ({
        ...this.toResponse(highlight),
        book: highlight.book,
      })),
    };
  }

  async create(
    bookId: string,
    input: CreateHighlightInput,
  ): Promise<HighlightResponse> {
    await this.requireBook(bookId);

    const chapterText = await this.highlights.findChapterText(
      bookId,
      input.chapterPosition,
    );
    if (chapterText === null) {
      throw new InvalidHighlightChapterError(bookId, input.chapterPosition);
    }

    const codePoints = Array.from(chapterText);
    const isRangeInsideChapter =
      input.startOffset < input.endOffset &&
      input.endOffset <= codePoints.length;
    if (!isRangeInsideChapter) {
      throw new InvalidHighlightRangeError(
        'O trecho marcado está fora do capítulo. Atualize a página e tente de novo.',
      );
    }

    const quote = codePoints
      .slice(input.startOffset, input.endOffset)
      .join('')
      .trim();
    const quoteLength = Array.from(quote).length;
    if (quoteLength === 0) {
      throw new InvalidHighlightRangeError(
        'Selecione um trecho com texto para marcar.',
      );
    }
    if (quoteLength > MAX_HIGHLIGHT_QUOTE_LENGTH) {
      throw new InvalidHighlightRangeError(
        `A marcação pode ter no máximo ${MAX_HIGHLIGHT_QUOTE_LENGTH} caracteres.`,
      );
    }

    const overlapping = await this.highlights.findOverlapping(
      bookId,
      input.chapterPosition,
      input.startOffset,
      input.endOffset,
    );
    if (overlapping !== null) {
      throw new HighlightOverlapError(bookId, input.chapterPosition);
    }

    const record: CreateHighlightRecord = {
      chapterPosition: input.chapterPosition,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      quote,
      color: HighlightColorMapper.toRecord(input.color),
    };
    const highlight = await this.highlights.create(bookId, record);

    this.logger.log(
      `Marcação criada: bookId=${bookId}, highlightId=${highlight.id}, capítulo=${input.chapterPosition}, cor=${input.color}.`,
    );

    return this.toResponse(highlight);
  }

  async update(
    bookId: string,
    highlightId: string,
    input: UpdateHighlightInput,
  ): Promise<HighlightResponse> {
    await this.requireBook(bookId);
    const existing = await this.highlights.findById(bookId, highlightId);
    if (existing === null) {
      throw new HighlightNotFoundError(bookId, highlightId);
    }

    const color = HighlightColorMapper.toRecord(input.color);
    const highlight = await this.highlights.updateColor(highlightId, color);

    this.logger.log(
      `Marcação atualizada: bookId=${bookId}, highlightId=${highlightId}, cor=${input.color}.`,
    );

    return this.toResponse(highlight);
  }

  async remove(bookId: string, highlightId: string): Promise<void> {
    await this.requireBook(bookId);
    const existing = await this.highlights.findById(bookId, highlightId);
    if (existing === null) {
      throw new HighlightNotFoundError(bookId, highlightId);
    }

    await this.highlights.delete(highlightId);

    this.logger.log(
      `Marcação excluída: bookId=${bookId}, highlightId=${highlightId}.`,
    );
  }

  private async requireBook(bookId: string): Promise<void> {
    const book = await this.ebooks.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);
  }

  private toRecordColor(color: HighlightColorValue | undefined) {
    return color === undefined
      ? undefined
      : HighlightColorMapper.toRecord(color);
  }

  private toResponse(highlight: Highlight): HighlightResponse {
    return {
      id: highlight.id,
      bookId: highlight.bookId,
      chapterPosition: highlight.chapterPosition,
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset,
      quote: highlight.quote,
      color: HighlightColorMapper.toValue(highlight.color),
      createdAt: highlight.createdAt.toISOString(),
      updatedAt: highlight.updatedAt.toISOString(),
    };
  }
}
