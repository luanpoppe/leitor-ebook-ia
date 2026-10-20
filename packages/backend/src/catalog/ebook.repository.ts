import { Injectable, Logger } from '@nestjs/common';
import { Book, BookFormat, BookStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';
import {
  DuplicateEbookError,
  EbookNotFoundError,
  InvalidEbookInputError,
} from './catalog.errors';

export interface CreateEbookInput {
  title: string;
  format: BookFormat;
  sizeBytes: number;
  hash: string;
  storageKey: string;
}

export interface ListEbooksParams {
  take?: number;
  skip?: number;
}

const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_FAILURE_MESSAGE = 'Falha na ingestão sem detalhe informado.';

@Injectable()
export class EbookRepository {
  private readonly logger = new Logger(EbookRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEbookInput): Promise<Book> {
    const normalizedHash = this.assertValidCreateInput(input);

    try {
      const book = await this.prisma.book.create({
        data: {
          title: input.title,
          format: input.format,
          sizeBytes: input.sizeBytes,
          hash: normalizedHash,
          storageKey: input.storageKey,
          status: BookStatus.PENDING,
        },
      });

      this.logger.log(`Ebook criado: ${book.id} (hash ${normalizedHash}).`);
      return book;
    } catch (error) {
      return this.handleCreateFailure(normalizedHash, error);
    }
  }

  async findById(id: string): Promise<Book | null> {
    const isIdValid = this.isUuid(id);
    if (!isIdValid) return null;

    return this.prisma.book.findUnique({ where: { id } });
  }

  async findByHash(hash: string): Promise<Book | null> {
    const normalizedHash = hash.trim().toLowerCase();
    const isHashValid = HASH_PATTERN.test(normalizedHash);
    if (!isHashValid) return null;

    return this.prisma.book.findUnique({ where: { hash: normalizedHash } });
  }

  async list(params: ListEbooksParams = {}): Promise<Book[]> {
    return this.prisma.book.findMany({
      take: params.take,
      skip: params.skip,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async updateStatus(
    id: string,
    status: BookStatus,
    errorMessage?: string | null,
  ): Promise<void> {
    this.assertUuidOrNotFound(id);

    const data = this.buildStatusUpdateData(status, errorMessage);

    // Atualização condicional: um ebook já READY não volta a PENDING/PROCESSING/FAILED
    // por causa de um retry obsoleto.
    const result = await this.prisma.book.updateMany({
      where: { id, status: { not: BookStatus.READY } },
      data,
    });

    const wasUpdated = result.count > 0;
    if (wasUpdated) {
      this.logger.log(`Status do ebook ${id} alterado para ${status}.`);
      return;
    }

    await this.handleStatusUpdateBlocked(id, status);
  }

  private assertValidCreateInput(input: CreateEbookInput): string {
    const isTitleEmpty = input.title.trim().length === 0;
    if (isTitleEmpty) {
      throw new InvalidEbookInputError(
        'O título do ebook não pode ser vazio.',
      );
    }

    const normalizedHash = input.hash.trim().toLowerCase();
    const isHashValid = HASH_PATTERN.test(normalizedHash);
    if (!isHashValid) {
      throw new InvalidEbookInputError(
        'O hash do ebook deve ter 64 caracteres hexadecimais (SHA-256).',
      );
    }

    const isStorageKeyEmpty = input.storageKey.trim().length === 0;
    if (isStorageKeyEmpty) {
      throw new InvalidEbookInputError(
        'A chave de armazenamento do ebook não pode ser vazia.',
      );
    }

    const isSizeInvalid =
      !Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0;
    if (isSizeInvalid) {
      throw new InvalidEbookInputError(
        'O tamanho do ebook deve ser maior que zero.',
      );
    }

    return normalizedHash;
  }

  private buildStatusUpdateData(
    status: BookStatus,
    errorMessage?: string | null,
  ): Prisma.BookUpdateManyMutationInput {
    const isFailure = status === BookStatus.FAILED;
    if (!isFailure) return { status, errorMessage: null };

    return { status, errorMessage: this.resolveFailureMessage(errorMessage) };
  }

  private resolveFailureMessage(errorMessage?: string | null): string {
    const detail = errorMessage?.trim();
    if (!detail) return DEFAULT_FAILURE_MESSAGE;

    return detail;
  }

  private async handleStatusUpdateBlocked(
    id: string,
    attemptedStatus: BookStatus,
  ): Promise<void> {
    const existingBook = await this.prisma.book.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existingBook) throw new EbookNotFoundError(id);

    this.logger.log(
      `Atualização de status ignorada para o ebook ${id}: já está ${existingBook.status} (tentativa de ${attemptedStatus}).`,
    );
  }

  private async handleCreateFailure(
    hash: string,
    error: unknown,
  ): Promise<Book> {
    const isDuplicateHash = this.isKnownError(
      error,
      PRISMA_UNIQUE_CONSTRAINT_CODE,
    );
    if (!isDuplicateHash) throw error;

    const existingBook = await this.prisma.book.findUnique({
      where: { hash },
      select: { id: true },
    });
    if (!existingBook) throw error;

    this.logger.warn(
      `Ebook duplicado detectado para o hash ${hash} (id ${existingBook.id}).`,
    );
    throw new DuplicateEbookError(existingBook.id);
  }

  private isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  private assertUuidOrNotFound(id: string): void {
    const isIdValid = this.isUuid(id);
    if (isIdValid) return;

    throw new EbookNotFoundError(id);
  }

  private isKnownError(error: unknown, code: string): boolean {
    const isPrismaError =
      error instanceof Prisma.PrismaClientKnownRequestError;
    if (!isPrismaError) return false;
    return error.code === code;
  }
}
