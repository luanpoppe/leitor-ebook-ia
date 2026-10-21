import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { EbookRepository } from '../../catalog/ebook.repository';
import { EbookNotFoundError } from '../../catalog/catalog.errors';
import { BookFormat, BookStatus } from '../../generated/prisma/client';
import { IngestionQueue } from '../../ingestion/ingestion.queue';
import { FileStorageService } from '../../storage/file-storage.service';
import {
  EmptyEbookFileError,
  InvalidEbookStatusError,
  UnsupportedEbookFormatError,
} from './ebooks.errors';
import type {
  ReprocessEbookResponse,
  UploadEbookResponse,
} from './ebooks.schemas';

/** Arquivo temporário entregue pelo multer no upload. */
export interface UploadedEbookFile {
  path: string;
  originalname: string;
  size: number;
}

const FORMAT_BY_EXTENSION: Record<string, BookFormat> = {
  epub: BookFormat.EPUB,
  pdf: BookFormat.PDF,
  txt: BookFormat.TXT,
  md: BookFormat.MD,
};

const MAX_TITLE_LENGTH = 200;
const FALLBACK_TITLE = 'Ebook';
const API_PENDING_STATUS = 'pending';

/**
 * Orquestra o upload de um ebook: valida, grava no storage, cria o catálogo e
 * enfileira a ingestão. Se a fila falhar, a compensação desfaz storage e
 * catálogo para o livro não ficar órfão.
 */
@Injectable()
export class EbookUploadService {
  private readonly logger = new Logger(EbookUploadService.name);

  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly storage: FileStorageService,
    private readonly ingestionQueue: IngestionQueue,
  ) {}

  async upload(file: UploadedEbookFile): Promise<UploadEbookResponse> {
    try {
      return await this.processUpload(file);
    } finally {
      await this.removeTempFile(file.path);
    }
  }

  async reprocess(bookId: string): Promise<ReprocessEbookResponse> {
    const book = await this.ebookRepository.findById(bookId);
    if (!book) throw new EbookNotFoundError(bookId);

    const canReprocess = book.status === BookStatus.FAILED;
    if (!canReprocess) throw new InvalidEbookStatusError(book.status);

    await this.ebookRepository.updateStatus(bookId, BookStatus.PENDING);
    this.logger.log(`Reprocessamento iniciado: bookId=${bookId}.`);

    try {
      await this.ingestionQueue.enqueue(bookId);
    } catch (error) {
      await this.restoreFailedStatus(bookId, book.errorMessage);
      throw error;
    }

    return { id: bookId, status: API_PENDING_STATUS };
  }

  private async processUpload(
    file: UploadedEbookFile,
  ): Promise<UploadEbookResponse> {
    const isEmptyFile = file.size <= 0;
    if (isEmptyFile) throw new EmptyEbookFileError();

    const format = this.resolveFormat(file.originalname);
    const hash = await this.hashFile(file.path);
    const stream = createReadStream(file.path);
    const storageKey = await this.storage.put({
      stream,
      size: file.size,
      hash,
      format,
    });

    const title = this.resolveTitle(file.originalname);
    const book = await this.ebookRepository.create({
      title,
      format,
      sizeBytes: file.size,
      hash,
      storageKey,
    });

    await this.enqueueOrCompensate(book.id, storageKey);

    this.logger.log(
      `Upload concluído: bookId=${book.id} hash=${hash} formato=${format}.`,
    );

    return {
      id: book.id,
      status: this.toApiStatus(book.status),
      title: book.title,
    };
  }

  private async enqueueOrCompensate(
    bookId: string,
    storageKey: string,
  ): Promise<void> {
    try {
      await this.ingestionQueue.enqueue(bookId);
    } catch (error) {
      await this.compensate(storageKey, bookId);
      throw error;
    }
  }

  private async compensate(
    storageKey: string,
    bookId: string,
  ): Promise<void> {
    this.logger.warn(
      `Compensando upload sem fila: bookId=${bookId} storageKey=${storageKey}.`,
    );

    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(
        `Falha ao remover objeto na compensação: bookId=${bookId} storageKey=${storageKey} erro=${message}`,
      );
    }

    try {
      await this.ebookRepository.deleteById(bookId);
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(
        `Falha ao remover livro na compensação: bookId=${bookId} erro=${message}`,
      );
    }
  }

  private async restoreFailedStatus(
    bookId: string,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.ebookRepository.updateStatus(
        bookId,
        BookStatus.FAILED,
        errorMessage,
      );
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(
        `Falha ao restaurar status failed: bookId=${bookId} erro=${message}`,
      );
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  }

  private resolveFormat(originalname: string): BookFormat {
    const extension = extname(originalname).slice(1).toLowerCase();
    const format = FORMAT_BY_EXTENSION[extension];

    if (!format) throw new UnsupportedEbookFormatError();

    return format;
  }

  private resolveTitle(originalname: string): string {
    const filename = basename(originalname);
    const extension = extname(filename);
    const rawTitle = filename
      .slice(0, filename.length - extension.length)
      .trim();

    if (rawTitle.length === 0) return FALLBACK_TITLE;

    return rawTitle.slice(0, MAX_TITLE_LENGTH);
  }

  private toApiStatus(status: BookStatus): string {
    return status.toLowerCase();
  }

  private async removeTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // Arquivo temporário pode já ter sido removido; o upload não falha por isso.
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
