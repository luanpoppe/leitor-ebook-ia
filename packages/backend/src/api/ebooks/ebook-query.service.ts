import { Injectable } from '@nestjs/common';
import { EbookNotFoundError } from '../../catalog/catalog.errors';
import { EbookRepository } from '../../catalog/ebook.repository';
import { Book } from '../../generated/prisma/client';
import type { EbookDetail, EbookSummary, PagedEbooks } from './ebooks.schemas';

/**
 * Leitura do catálogo para a API: listagem paginada da estante e detalhe de um
 * ebook, montando a URL da capa no host da requisição.
 */
@Injectable()
export class EbookQueryService {
  constructor(private readonly ebookRepository: EbookRepository) {}

  async list(
    query: { page: number; pageSize: number },
    origin: string,
  ): Promise<PagedEbooks> {
    const skip = (query.page - 1) * query.pageSize;
    const listParams = { take: query.pageSize, skip };
    const listPromise = this.ebookRepository.list(listParams);
    const countPromise = this.ebookRepository.count();

    const [books, total] = await Promise.all([listPromise, countPromise]);
    const items = books.map((book) => this.toSummaryWithCover(book, origin));

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async findById(bookId: string, origin: string): Promise<EbookDetail> {
    const book = await this.ebookRepository.findById(bookId);
    if (!book) throw new EbookNotFoundError(bookId);

    const summary = this.toSummary(book);
    const coverUrl = this.resolveCoverUrl(book, origin);

    return {
      ...summary,
      size: book.sizeBytes,
      errorMessage: book.errorMessage,
      coverUrl,
    };
  }

  private toSummary(book: Book): Omit<EbookSummary, 'coverUrl'> {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      format: book.format.toLowerCase(),
      status: book.status.toLowerCase(),
      createdAt: book.createdAt.toISOString(),
    };
  }

  private toSummaryWithCover(book: Book, origin: string): EbookSummary {
    const summary = this.toSummary(book);
    const coverUrl = this.resolveCoverUrl(book, origin);

    return { ...summary, coverUrl };
  }

  /**
   * A capa é servida pelo backend. O path é absoluto no host da requisição,
   * então funciona igual em localhost, IP da rede ou Tailscale — sem depender
   * do endpoint interno do MinIO nem de URL pré-assinada.
   */
  private resolveCoverUrl(book: Book, origin: string): string | null {
    const coverStorageKey = book.coverStorageKey?.trim() ?? '';
    if (coverStorageKey.length === 0) return null;

    return `${origin.replace(/\/$/, '')}/ebooks/${book.id}/cover`;
  }
}
