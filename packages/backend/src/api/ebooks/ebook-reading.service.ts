import { Injectable } from '@nestjs/common';
import {
  ChapterNotFoundError,
  EbookNotFoundError,
  EbookNotReadyError,
} from '../../catalog/catalog.errors';
import { ChapterReadingRepository } from '../../catalog/chapter-reading.repository';
import { EbookRepository } from '../../catalog/ebook.repository';
import { BookStatus } from '../../generated/prisma/client';
import type {
  ChapterContentResponse,
  ChapterListResponse,
} from './chapters.schemas';

/**
 * Leitura do ebook pela API: sumário de capítulos e uma página de texto por
 * offset de caractere. Só livros com status READY podem ser lidos — os demais
 * viram erro de domínio em vez de sumário vazio.
 */
@Injectable()
export class EbookReadingService {
  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly readingRepository: ChapterReadingRepository,
  ) {}

  async listChapters(bookId: string): Promise<ChapterListResponse> {
    await this.assertBookReady(bookId);

    const items = await this.readingRepository.listSummaries(bookId);

    return { items };
  }

  async readChapter(
    bookId: string,
    position: number,
    page: { offset: number; limit: number },
  ): Promise<ChapterContentResponse> {
    await this.assertBookReady(bookId);

    const chapter = await this.readingRepository.findPage(
      bookId,
      position,
      page.offset,
      page.limit,
    );
    if (chapter === null) throw new ChapterNotFoundError(bookId, position);

    const adjacent = await this.readingRepository.findAdjacentPositions(
      bookId,
      position,
    );

    // O próximo offset é calculado em caracteres sobre `totalLength` (contado
    // pelo banco com `char_length`), não sobre `text.length`, que conta
    // unidades UTF-16 e divergiria em textos com acentos ou emoji.
    const nextOffsetCandidate = page.offset + page.limit;
    const hasNextPage = nextOffsetCandidate < chapter.totalLength;
    const nextOffset = hasNextPage ? nextOffsetCandidate : null;

    return {
      ...chapter,
      offset: page.offset,
      limit: page.limit,
      nextOffset,
      previousPosition: adjacent.previousPosition,
      nextPosition: adjacent.nextPosition,
    };
  }

  private async assertBookReady(bookId: string): Promise<void> {
    const book = await this.ebookRepository.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);

    const isReady = book.status === BookStatus.READY;
    if (!isReady) throw new EbookNotReadyError(bookId, book.status);
  }
}
