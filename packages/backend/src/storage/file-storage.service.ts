import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Client } from 'minio';
import type { Readable } from 'node:stream';
import { EnvService } from '../core/env.service';
import {
  MINIO_CLIENT,
  type MinioClient,
} from '../core/storage/storage.provider';
import { BookFormat } from '../generated/prisma/client';
import {
  InvalidStorageInputError,
  StorageObjectNotFoundError,
  StorageUnavailableError,
} from './storage.errors';

export interface PutObjectInput {
  stream: Readable;
  size: number;
  hash: string;
  format: BookFormat;
}

const DEFAULT_BUCKET = 'ebooks';

const PRESIGNED_URL_EXPIRES_IN_SECONDS = 3600;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

const FORMAT_EXTENSION: Record<BookFormat, string> = {
  [BookFormat.EPUB]: 'epub',
  [BookFormat.PDF]: 'pdf',
  [BookFormat.TXT]: 'txt',
  [BookFormat.MD]: 'md',
};

const FORMAT_CONTENT_TYPE: Record<BookFormat, string> = {
  [BookFormat.EPUB]: 'application/epub+zip',
  [BookFormat.PDF]: 'application/pdf',
  [BookFormat.TXT]: 'text/plain',
  [BookFormat.MD]: 'text/markdown',
};

interface SdkError {
  code?: string;
  status?: number;
  statusCode?: number;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    private readonly env: EnvService,
  ) {}

  async put(input: PutObjectInput): Promise<string> {
    this.assertValidHash(input.hash);
    const client = this.requireClient();

    const storageKey = this.buildStorageKey(input.hash, input.format);
    const contentType = this.contentTypeFor(input.format);

    await client.putObject(this.bucket, storageKey, input.stream, input.size, {
      'Content-Type': contentType,
    });

    this.logger.log(`Objeto gravado no storage: ${storageKey}`);
    return storageKey;
  }

  async get(storageKey: string): Promise<Readable> {
    this.assertValidStorageKey(storageKey);
    const client = this.requireClient();

    const stream = await this.runReadOperation(
      () => client.getObject(this.bucket, storageKey),
      storageKey,
    );

    return stream;
  }

  async getPresignedUrl(storageKey: string): Promise<string> {
    this.assertValidStorageKey(storageKey);
    const client = this.requireClient();

    await this.assertObjectExists(client, storageKey);
    const url = await this.runReadOperation(
      () =>
        client.presignedGetObject(
          this.bucket,
          storageKey,
          PRESIGNED_URL_EXPIRES_IN_SECONDS,
        ),
      storageKey,
    );

    return url;
  }

  async remove(storageKey: string): Promise<void> {
    this.assertValidStorageKey(storageKey);
    const client = this.requireClient();

    try {
      await client.removeObject(this.bucket, storageKey);
    } catch (error) {
      // Alguns backends S3 respondem 404 para remoção de chave inexistente;
      // a operação continua idempotente nesse caso.
      if (this.isNotFoundError(error)) return;
      this.rethrowWithLog(error, storageKey);
    }

    this.logger.log(`Objeto removido do storage: ${storageKey}`);
  }

  private async assertObjectExists(
    client: Client,
    storageKey: string,
  ): Promise<void> {
    await this.runReadOperation(
      () => client.statObject(this.bucket, storageKey),
      storageKey,
    );
  }

  private async runReadOperation<T>(
    operation: () => Promise<T>,
    storageKey: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new StorageObjectNotFoundError(storageKey);
      }
      this.rethrowWithLog(error, storageKey);
    }
  }

  private rethrowWithLog(error: unknown, storageKey: string): never {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    this.logger.error(
      `Falha ao acessar o objeto ${storageKey} no storage: ${normalizedError.message}`,
      normalizedError.stack,
    );

    throw normalizedError;
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const sdkError = error as SdkError;
    const isKnownCode =
      sdkError.code === 'NoSuchKey' || sdkError.code === 'NotFound';
    const isHttpNotFound =
      sdkError.statusCode === 404 || sdkError.status === 404;

    return isKnownCode || isHttpNotFound;
  }

  private assertValidHash(hash: string): void {
    if (SHA256_HEX_PATTERN.test(hash)) return;

    throw new InvalidStorageInputError(
      `Hash inválido para o storage: "${hash}". Esperado SHA-256 em hexadecimal (64 caracteres).`,
    );
  }

  private assertValidStorageKey(storageKey: string): void {
    if (storageKey.trim().length > 0) return;

    throw new InvalidStorageInputError(
      'A storageKey do objeto no armazenamento não pode ser vazia.',
    );
  }

  private requireClient(): Client {
    const client = this.client;

    if (!client) {
      throw new StorageUnavailableError();
    }

    return client;
  }

  private buildStorageKey(hash: string, format: BookFormat): string {
    const extension = FORMAT_EXTENSION[format];
    return `${hash}.${extension}`;
  }

  private contentTypeFor(format: BookFormat): string {
    return FORMAT_CONTENT_TYPE[format];
  }

  private get bucket(): string {
    return this.env.getEnvs().MINIO_BUCKET ?? DEFAULT_BUCKET;
  }
}
