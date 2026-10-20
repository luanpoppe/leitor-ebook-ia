import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Client } from 'minio';
import type { Readable } from 'node:stream';
import { EnvService } from '../core/env.service';
import {
  DEFAULT_MINIO_BUCKET,
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
}

interface StreamFailureGuard {
  promise: Promise<never>;
  dispose: () => void;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  /**
   * Serializa gravações da mesma storageKey. O SDK do MinIO reaproveita o
   * `uploadId` quando o mesmo objeto é enviado em paralelo e o segundo envio
   * falha com `NoSuchUpload`. O mutex vale apenas dentro deste processo —
   * múltiplas instâncias ainda podem disputar a mesma chave.
   */
  private readonly putLocks = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    private readonly env: EnvService,
  ) {}

  async put(input: PutObjectInput): Promise<string> {
    const hash = input.hash.trim().toLowerCase();
    this.assertValidHash(hash);
    this.assertValidSize(input.size);
    const client = this.requireClient();

    const storageKey = this.buildStorageKey(hash, input.format);

    return this.withPutLock(storageKey, () =>
      this.writeObject(client, storageKey, input),
    );
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
      // Remover chave inexistente é idempotente. Erros de bucket (ex.:
      // NoSuchBucket) precisam propagar: mascarar como "não encontrado"
      // esconderia um storage mal configurado.
      if (this.isNotFoundError(error)) return;
      this.rethrowWithLog(error, storageKey);
    }

    this.logger.log(`Objeto removido do storage: ${storageKey}`);
  }

  private async writeObject(
    client: Client,
    storageKey: string,
    input: PutObjectInput,
  ): Promise<string> {
    const contentType = this.contentTypeFor(input.format);
    const metadata = { 'Content-Type': contentType };

    try {
      await this.runUpload(
        client,
        storageKey,
        input.stream,
        input.size,
        metadata,
      );
    } catch (error) {
      this.logWriteFailure(error, storageKey);
      throw error;
    }

    this.logger.log(`Objeto gravado no storage: ${storageKey}`);
    return storageKey;
  }

  /**
   * Executa o upload corrida contra uma promise que rejeita quando o stream
   * de entrada falha. Sem isso, o `putObject` do SDK fica pendente (ou deixa
   * o erro do stream subir sem handler) em arquivos grandes o suficiente
   * para ir por multipart.
   */
  private async runUpload(
    client: Client,
    storageKey: string,
    stream: Readable,
    size: number,
    metadata: Record<string, string>,
  ): Promise<void> {
    const streamFailure = this.guardStreamFailure(stream);

    try {
      const upload = client.putObject(
        this.bucket,
        storageKey,
        stream,
        size,
        metadata,
      );

      await Promise.race([upload, streamFailure.promise]);
    } finally {
      streamFailure.dispose();
    }
  }

  private guardStreamFailure(stream: Readable): StreamFailureGuard {
    let rejectFailure: (error: Error) => void = () => undefined;

    const promise = new Promise<never>((_, reject) => {
      rejectFailure = reject;
    });

    const failUpload = (reason: string): void => {
      rejectFailure(
        new StorageUnavailableError(
          `Falha no stream de upload: ${reason}.`,
        ),
      );
    };

    const onError = (error: Error): void => failUpload(error.message);
    const onAborted = (): void => failUpload('stream abortado');

    stream.on('error', onError);
    stream.on('aborted', onAborted);

    const dispose = (): void => {
      stream.removeListener('error', onError);
      stream.removeListener('aborted', onAborted);
    };

    return { promise, dispose };
  }

  private async withPutLock<T>(
    storageKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.putLocks.get(storageKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.putLocks.set(storageKey, current);

    try {
      return await current;
    } finally {
      const isLatestOperation = this.putLocks.get(storageKey) === current;
      if (isLatestOperation) this.putLocks.delete(storageKey);
    }
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
    const normalizedError = this.toError(error);

    this.logger.error(
      `Falha ao acessar o objeto ${storageKey} no storage: ${normalizedError.message}`,
      normalizedError.stack,
    );

    throw normalizedError;
  }

  private logWriteFailure(error: unknown, storageKey: string): void {
    const normalizedError = this.toError(error);

    this.logger.error(
      `Falha ao gravar o objeto ${storageKey}: ${normalizedError.message}`,
      normalizedError.stack,
    );
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Apenas códigos de "objeto ausente" contam como não encontrado. Um 404
   * genérico (ou `NoSuchBucket`) deve propagar para não virar 404 de livro
   * nem sucesso silencioso no `remove`.
   */
  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const sdkError = error as SdkError;
    return sdkError.code === 'NoSuchKey' || sdkError.code === 'NotFound';
  }

  private assertValidHash(hash: string): void {
    if (SHA256_HEX_PATTERN.test(hash)) return;

    throw new InvalidStorageInputError(
      `Hash inválido para o storage: "${hash}". Esperado SHA-256 em hexadecimal (64 caracteres).`,
    );
  }

  private assertValidSize(size: number): void {
    // O SDK do MinIO entra em loop síncrono em `calculatePartSize` quando o
    // tamanho não é finito, congelando o event loop antes de qualquer I/O.
    const isValidSize = Number.isFinite(size) && size > 0;
    if (isValidSize) return;

    throw new InvalidStorageInputError(
      `Tamanho inválido para o storage: ${size}. Esperado um número finito e maior que zero.`,
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
    return this.env.getEnvs().MINIO_BUCKET || DEFAULT_MINIO_BUCKET;
  }
}
