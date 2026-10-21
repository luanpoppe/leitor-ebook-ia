import { Injectable, Logger } from '@nestjs/common';
import { EbookNotFoundError } from '../../catalog/catalog.errors';
import { EbookRepository } from '../../catalog/ebook.repository';
import { Book } from '../../generated/prisma/client';
import { FileStorageService } from '../../storage/file-storage.service';
import {
  StorageObjectNotFoundError,
  StorageUnavailableError,
} from '../../storage/storage.errors';
import type { EbookDetail, EbookSummary, PagedEbooks } from './ebooks.schemas';

/**
 * Leitura do catálogo para a API: listagem paginada da estante e detalhe de um
 * ebook, resolvendo a URL pré-assinada da capa quando existir.
 */
@Injectable()
export class EbookQueryService {
  private readonly logger = new Logger(EbookQueryService.name);

  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly storage: FileStorageService,
  ) {}

  async list(query: { page: number; pageSize: number }): Promise<PagedEbooks> {
    const skip = (query.page - 1) * query.pageSize;
    const listParams = { take: query.pageSize, skip };
    const listPromise = this.ebookRepository.list(listParams);
    const countPromise = this.ebookRepository.count();

    const [books, total] = await Promise.all([listPromise, countPromise]);
    const items = books.map((book) => this.toSummary(book));

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async findById(bookId: string): Promise<EbookDetail> {
    const book = await this.ebookRepository.findById(bookId);
    if (!book) throw new EbookNotFoundError(bookId);

    const summary = this.toSummary(book);
    const coverUrl = await this.resolveCoverUrl(book.coverStorageKey);

    return {
      ...summary,
      size: book.sizeBytes,
      errorMessage: book.errorMessage,
      coverUrl,
    };
  }

  private toSummary(book: Book): EbookSummary {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      format: book.format.toLowerCase(),
      status: book.status.toLowerCase(),
      createdAt: book.createdAt.toISOString(),
    };
  }

  /**
   * A capa é opcional: se o objeto sumiu do storage ou o storage está fora, o
   * detalhe do livro continua respondendo, só sem `coverUrl`.
   */
  private async resolveCoverUrl(
    coverStorageKey: string | null,
  ): Promise<string | null> {
    const hasCoverKey =
      coverStorageKey !== null && coverStorageKey.trim().length > 0;
    if (!hasCoverKey) return null;

    try {
      return await this.storage.getPresignedUrl(coverStorageKey);
    } catch (error) {
      const isExpectedCoverFailure =
        error instanceof StorageObjectNotFoundError ||
        error instanceof StorageUnavailableError;
      if (!isExpectedCoverFailure) throw error;

      const message = this.errorMessage(error);
      this.logger.warn(
        `Capa indisponível para a chave ${coverStorageKey}: ${message}`,
      );
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
