import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { MulterError } from 'multer';
import {
  DuplicateEbookError,
  EbookNotFoundError,
  InvalidEbookContentError,
  InvalidEbookInputError,
} from '../../catalog/catalog.errors';
import { QueueUnavailableError } from '../../ingestion/ingestion.errors';
import {
  InvalidStorageInputError,
  StorageObjectNotFoundError,
  StorageUnavailableError,
} from '../../storage/storage.errors';
import {
  EmptyEbookFileError,
  InvalidEbookStatusError,
  UnsupportedEbookFormatError,
} from './ebooks.errors';

const FILE_TOO_LARGE_MESSAGE = 'O arquivo excede o limite de 50 MB.';

const SERVER_ERROR_STATUS = 500;

interface ErrorBody {
  statusCode: number;
  message: string;
  id?: string;
}

/**
 * Traduz os erros de domínio da API de ebooks para HTTP e deixa qualquer
 * outro erro para o filtro padrão do Nest.
 */
@Catch(
  EbookNotFoundError,
  DuplicateEbookError,
  InvalidEbookContentError,
  InvalidEbookInputError,
  StorageUnavailableError,
  StorageObjectNotFoundError,
  InvalidStorageInputError,
  QueueUnavailableError,
  UnsupportedEbookFormatError,
  EmptyEbookFileError,
  InvalidEbookStatusError,
  MulterError,
)
export class EbooksExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(EbooksExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof MulterError) {
      this.handleMulterError(exception, host);
      return;
    }

    const statusCode = this.resolveStatusCode(exception);
    if (statusCode === null) {
      super.catch(exception, host);
      return;
    }

    this.logIfServerError(statusCode, exception);

    const body: ErrorBody = {
      statusCode,
      message: this.resolveMessage(exception),
    };
    if (exception instanceof DuplicateEbookError) {
      body.id = exception.existingBookId;
    }

    this.reply(host, body);
  }

  private handleMulterError(error: MulterError, host: ArgumentsHost): void {
    const isFileTooLarge = error.code === 'LIMIT_FILE_SIZE';
    if (isFileTooLarge) {
      this.reply(host, {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: FILE_TOO_LARGE_MESSAGE,
      });
      return;
    }

    this.reply(host, {
      statusCode: HttpStatus.BAD_REQUEST,
      message: error.message,
    });
  }

  private resolveStatusCode(exception: unknown): number | null {
    if (exception instanceof EbookNotFoundError) return HttpStatus.NOT_FOUND;
    if (exception instanceof StorageObjectNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (exception instanceof DuplicateEbookError) return HttpStatus.CONFLICT;
    if (exception instanceof InvalidEbookStatusError) {
      return HttpStatus.CONFLICT;
    }
    if (exception instanceof UnsupportedEbookFormatError) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    if (exception instanceof EmptyEbookFileError) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    if (exception instanceof InvalidEbookContentError) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    if (exception instanceof InvalidEbookInputError) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    if (exception instanceof StorageUnavailableError) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    if (exception instanceof QueueUnavailableError) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    if (exception instanceof InvalidStorageInputError) {
      return HttpStatus.BAD_REQUEST;
    }
    return null;
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof Error) return exception.message;
    return String(exception);
  }

  private logIfServerError(statusCode: number, exception: unknown): void {
    const isServerError = statusCode >= SERVER_ERROR_STATUS;
    if (!isServerError) return;

    const reason = this.resolveMessage(exception);
    this.logger.warn(`Erro ${statusCode} na API de ebooks: ${reason}`);
  }

  private reply(host: ArgumentsHost, body: ErrorBody): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    response.status(body.statusCode).json(body);
  }
}
