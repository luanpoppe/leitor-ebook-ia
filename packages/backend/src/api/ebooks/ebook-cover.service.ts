import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { extname } from 'node:path';
import { EbookNotFoundError } from '../../catalog/catalog.errors';
import { EbookRepository } from '../../catalog/ebook.repository';
import { FileStorageService } from '../../storage/file-storage.service';
import { StorageObjectNotFoundError } from '../../storage/storage.errors';

export interface CoverContent {
  stream: Readable;
  contentType: string;
  size: number;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Abre a capa do ebook para o backend servi-la por streaming. A URL pública
 * fica no host da API, sem depender do endpoint interno do MinIO.
 */
@Injectable()
export class EbookCoverService {
  constructor(
    private readonly ebooks: EbookRepository,
    private readonly storage: FileStorageService,
  ) {}

  async open(bookId: string): Promise<CoverContent> {
    const book = await this.ebooks.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);

    const coverStorageKey = book.coverStorageKey?.trim() ?? '';
    if (coverStorageKey.length === 0) {
      throw new StorageObjectNotFoundError(`covers/${bookId}`);
    }

    const info = await this.storage.stat(coverStorageKey);
    const stream = await this.storage.get(coverStorageKey);
    const contentType =
      info.contentType ?? resolveContentType(coverStorageKey);

    return { stream, contentType, size: info.size };
  }
}

function resolveContentType(storageKey: string): string {
  const extension = extname(storageKey).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
