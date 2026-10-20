import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  REDIS_CONNECTION,
  type RedisConnection,
} from '../core/queue/redis-connection.provider';
import {
  INGESTION_BACKOFF_DELAY_MS,
  INGESTION_JOB_ATTEMPTS,
  INGESTION_JOB_NAME,
  INGESTION_QUEUE_NAME,
} from './ingestion.constants';
import { QueueUnavailableError } from './ingestion.errors';

type IngestionJobData = { bookId: string };

/**
 * Enfileira a ingestão de um ebook na fila `ebook-ingestion`.
 *
 * A `Queue` do BullMQ é criada sob demanda na primeira chamada: sem Redis
 * configurado (`REDIS_CONNECTION` nula) não existe fila e o enfileiramento
 * falha com `QueueUnavailableError`, sem job fantasma.
 */
@Injectable()
export class IngestionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(IngestionQueue.name);
  private queue: Queue<IngestionJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION)
    private readonly connection: RedisConnection,
  ) {}

  async enqueue(bookId: string): Promise<string> {
    const connection = this.connection;
    if (!connection) {
      throw new QueueUnavailableError();
    }

    const queue = this.getQueue(connection);

    try {
      const job = await queue.add(
        INGESTION_JOB_NAME,
        { bookId },
        {
          jobId: bookId,
          attempts: INGESTION_JOB_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: INGESTION_BACKOFF_DELAY_MS,
          },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      // `jobId` é sempre o id do livro (definido acima nas options), então o
      // fallback só cobre o tipo opcional `job.id` do BullMQ.
      const jobId = job.id ?? bookId;
      this.logger.log(
        `Ingestão enfileirada: bookId=${bookId} jobId=${jobId}`,
      );

      return jobId;
    } catch (error) {
      const normalizedError = this.toError(error);
      this.logger.error(
        `Falha ao enfileirar ingestão do livro ${bookId}: ${normalizedError.message}`,
        normalizedError.stack,
      );

      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queue) return;

    try {
      await this.queue.close();
    } catch (error) {
      const normalizedError = this.toError(error);
      this.logger.warn(
        `Falha ao fechar a fila de ingestão: ${normalizedError.message}`,
      );
    }
  }

  private getQueue(connection: Redis): Queue<IngestionJobData> {
    if (this.queue) return this.queue;

    this.queue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
      connection,
    });

    return this.queue;
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
