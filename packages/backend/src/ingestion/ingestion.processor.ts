import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import {
  REDIS_CONNECTION,
  type RedisConnection,
} from '../core/queue/redis-connection.provider';
import { BookStatus } from '../generated/prisma/client';
import { INGESTION_QUEUE_NAME } from './ingestion.constants';
import { IngestionService } from './ingestion.service';

type IngestionJobData = { bookId: string };

/**
 * Consome a fila `ebook-ingestion`. Cada job carrega só o id do livro; toda a
 * decisão de estágio fica no `IngestionService`.
 *
 * Contagem de tentativas é do BullMQ: a falha sempre é relançada para ele
 * contar, exceto livro inexistente, que é erro definitivo (sem retry).
 */
@Injectable()
export class IngestionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionProcessor.name);
  private worker: Worker<IngestionJobData> | null = null;

  constructor(
    @Inject(REDIS_CONNECTION)
    private readonly connection: RedisConnection,
    private readonly ingestionService: IngestionService,
    private readonly ebookRepository: EbookRepository,
  ) {}

  onModuleInit(): void {
    const connection = this.connection;
    if (!connection) {
      this.logger.warn(
        'Worker de ingestão não iniciado: REDIS_URL não configurada.',
      );
      return;
    }

    this.worker = new Worker<IngestionJobData>(
      INGESTION_QUEUE_NAME,
      (job) => this.processJob(job),
      { connection, concurrency: 1 },
    );

    this.registerWorkerLogs(this.worker);
    this.logger.log(
      `Worker de ingestão iniciado na fila ${INGESTION_QUEUE_NAME}.`,
    );
  }

  async processJob(job: Job<IngestionJobData>): Promise<void> {
    const bookId = job.data.bookId;

    try {
      await this.ingestionService.process(bookId);
    } catch (error) {
      const isBookMissing = error instanceof EbookNotFoundError;
      if (isBookMissing) {
        this.logger.error(
          `Job descartado sem retry: bookId=${bookId}, motivo=${this.toMessage(error)}`,
        );
        throw new UnrecoverableError(this.toMessage(error));
      }

      await this.markFailedIfExhausted(job, bookId, error);
      // Relança sempre: o BullMQ precisa contar a tentativa e agendar o backoff.
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) return;

    try {
      await this.worker.close();
    } catch (error) {
      this.logger.warn(
        `Falha ao fechar o worker de ingestão: ${this.toMessage(error)}`,
      );
    }
  }

  private async markFailedIfExhausted(
    job: Job<IngestionJobData>,
    bookId: string,
    error: unknown,
  ): Promise<void> {
    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const isLastAttempt = attemptNumber >= maxAttempts;
    if (!isLastAttempt) return;

    const message = this.toMessage(error);
    await this.ebookRepository.updateStatus(bookId, BookStatus.FAILED, message);

    this.logger.error(
      `Ingestão falhou após ${maxAttempts} tentativas: bookId=${bookId}, motivo=${message}`,
    );
  }

  private registerWorkerLogs(worker: Worker<IngestionJobData>): void {
    worker.on('completed', (job) => {
      this.logger.log(
        `Ingestão concluída: bookId=${job.data.bookId} jobId=${job.id ?? 'sem-id'}`,
      );
    });

    worker.on('failed', (job, error) => {
      const bookId = job?.data.bookId ?? 'desconhecido';
      const jobId = job?.id ?? 'desconhecido';
      this.logger.warn(
        `Ingestão falhou: bookId=${bookId} jobId=${jobId} motivo=${this.toMessage(error)}`,
      );
    });
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
