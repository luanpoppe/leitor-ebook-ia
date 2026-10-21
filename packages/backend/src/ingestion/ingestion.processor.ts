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
import { IngestionQueue } from './ingestion.queue';
import { IngestionService } from './ingestion.service';

type IngestionJobData = { bookId: string };

const FAILURE_FALLBACK_MESSAGE = 'Falha na ingestão do ebook.';

/**
 * Consome a fila `ebook-ingestion`. Cada job carrega só o id do livro; toda a
 * decisão de estágio fica no `IngestionService`.
 *
 * Contagem de tentativas é do BullMQ: o processor só relança e o evento
 * `failed` decide o `failed` do livro quando as tentativas se esgotam. Isso
 * cobre também falhas decididas fora do processor (stall, deferred), que nunca
 * passam por `processJob`.
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
    private readonly ingestionQueue: IngestionQueue,
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
      if (!isBookMissing) throw error;

      const message = this.toMessage(error);
      await this.markFailed(bookId, message);
      this.logger.error(
        `Job descartado sem retry: bookId=${bookId}, motivo=${message}`,
      );

      throw new UnrecoverableError(message);
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

  private async markFailed(bookId: string, reason: string): Promise<void> {
    try {
      await this.ebookRepository.updateStatus(
        bookId,
        BookStatus.FAILED,
        reason,
      );
      this.logger.error(
        `Ingestão marcada como failed: bookId=${bookId}, motivo=${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao marcar livro como failed: bookId=${bookId}, motivo=${this.toMessage(error)}`,
      );
    }
  }

  private registerWorkerLogs(worker: Worker<IngestionJobData>): void {
    worker.on('completed', (job) => {
      this.logger.log(
        `Ingestão concluída: bookId=${job.data.bookId} jobId=${job.id ?? 'sem-id'}`,
      );
    });

    worker.on('failed', (job, error) => {
      void this.handleFailedJob(job, error);
    });
  }

  /**
   * Decide o `failed` do livro no fim das tentativas. O evento recebe também
   * falhas terminais do próprio BullMQ (stall, deferred), que não passam pelo
   * `processJob`.
   */
  private async handleFailedJob(
    job: Job<IngestionJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) {
      this.logger.warn(
        `Ingestão falhou sem job associado: motivo=${this.toMessage(error)}`,
      );
      return;
    }

    const bookId = job.data.bookId;
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;
    const reason = job.failedReason ?? FAILURE_FALLBACK_MESSAGE;

    this.logger.warn(
      `Ingestão falhou: bookId=${bookId} jobId=${job.id ?? 'desconhecido'} tentativa=${attemptsMade}/${maxAttempts} motivo=${reason}`,
    );

    const hasExhaustedAttempts = attemptsMade >= maxAttempts;
    if (!hasExhaustedAttempts) return;

    const isReprocessPending = await this.hasPendingReprocess(bookId);
    if (isReprocessPending) {
      await this.reenqueueAfterReprocess(bookId, reason);
      return;
    }

    await this.markFailed(bookId, reason);
  }

  /**
   * O reprocessamento da API marca `pending` antes de enfileirar; se o livro
   * ainda estiver `pending` no fim das tentativas, o pedido caiu na janela em
   * que este job estava ativo e o `enqueue` deduplicou contra ele. Sem isto, o
   * livro ficaria `pending` sem job nenhum e o próximo reprocess daria 409.
   */
  private async hasPendingReprocess(bookId: string): Promise<boolean> {
    try {
      const book = await this.ebookRepository.findById(bookId);
      return book?.status === BookStatus.PENDING;
    } catch (error) {
      this.logger.warn(
        `Falha ao consultar status para reprocessamento: bookId=${bookId} motivo=${this.toMessage(error)}`,
      );
      return false;
    }
  }

  private async reenqueueAfterReprocess(
    bookId: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.ingestionQueue.enqueue(bookId);
      this.logger.log(
        `Reprocessamento pendente reenfileirado: bookId=${bookId} motivoAnterior=${reason}`,
      );
    } catch (error) {
      const message = this.toMessage(error);
      this.logger.error(
        `Falha ao reenfileirar reprocessamento: bookId=${bookId} motivo=${message}`,
      );
      await this.markFailed(bookId, reason);
    }
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
