import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  REDIS_CONNECTION,
  type RedisConnection,
} from '../core/queue/redis-connection.provider';
import {
  INGESTION_BACKOFF_DELAY_MS,
  INGESTION_ENQUEUE_TIMEOUT_MS,
  INGESTION_JOB_ATTEMPTS,
  INGESTION_JOB_NAME,
  INGESTION_QUEUE_NAME,
} from './ingestion.constants';
import { QueueUnavailableError } from './ingestion.errors';

type IngestionJobData = { bookId: string };

const ENQUEUE_TIMEOUT_MESSAGE = 'A fila de ingestão não respondeu a tempo.';

/**
 * Enfileira a ingestão de um ebook na fila `ebook-ingestion`.
 *
 * A `Queue` do BullMQ é criada sob demanda na primeira chamada: sem Redis
 * configurado (`REDIS_CONNECTION` nula) não existe fila e o enfileiramento
 * falha com `QueueUnavailableError`, sem job fantasma.
 *
 * `jobId` é o id do livro, então o BullMQ deduplica enquanto o job está em
 * andamento. Um job terminal (`failed`/`completed`) é removido antes do `add`
 * — sem isso o BullMQ devolveria o job antigo e o reprocessamento nunca rodaria.
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
      const enqueueOperation = this.enqueueJob(queue, bookId);
      const jobId = await this.withEnqueueTimeout(enqueueOperation);
      this.logger.log(`Ingestão enfileirada: bookId=${bookId} jobId=${jobId}`);

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

  private async enqueueJob(
    queue: Queue<IngestionJobData>,
    bookId: string,
  ): Promise<string> {
    const runningJobId = await this.resolveExistingJob(queue, bookId);
    if (runningJobId) return runningJobId;

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
        // Job falho fica para inspeção; o `enqueue` o remove no reprocessamento.
        removeOnFail: 100,
      },
    );

    // `jobId` é sempre o id do livro (definido acima nas options), então o
    // fallback só cobre o tipo opcional `job.id` do BullMQ.
    return job.id ?? bookId;
  }

  /**
   * Devolve o id quando já existe job em andamento (dedupe real). Job em
   * estado terminal é removido para liberar o `jobId`; `unknown` significa que
   * o job sumiu do Redis e o `add` pode seguir.
   */
  private async resolveExistingJob(
    queue: Queue<IngestionJobData>,
    bookId: string,
  ): Promise<string | null> {
    const existingJob = await queue.getJob(bookId);
    if (!existingJob) return null;

    const state = await existingJob.getState();
    const isTerminalJob = state === 'failed' || state === 'completed';
    if (isTerminalJob) {
      await existingJob.remove();
      this.logger.log(
        `Job terminal removido para reenfileirar: bookId=${bookId} estado=${state}`,
      );

      return null;
    }

    const isLostJob = state === 'unknown';
    if (isLostJob) return null;

    this.logger.log(
      `Job já em andamento, enfileiramento ignorado: bookId=${bookId} estado=${state}`,
    );

    return bookId;
  }

  /**
   * Com Redis configurado mas fora do ar, `queue.add` nunca rejeita
   * (`maxRetriesPerRequest: null` + fila offline): o timeout traduz a espera
   * infinita em `QueueUnavailableError`.
   */
  private async withEnqueueTimeout<T>(operation: Promise<T>): Promise<T> {
    // Se o timeout vencer, a operação ainda pode rejeitar depois: o catch evita
    // unhandled rejection (a falha já foi traduzida para `QueueUnavailableError`).
    operation.catch(() => undefined);

    let timer: NodeJS.Timeout | undefined;

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new QueueUnavailableError(ENQUEUE_TIMEOUT_MESSAGE));
        }, INGESTION_ENQUEUE_TIMEOUT_MS);
      });

      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
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
