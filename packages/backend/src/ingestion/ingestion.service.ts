import { Injectable, Logger } from '@nestjs/common';
import { EbookContentRepository } from '../catalog/ebook-content.repository';
import type { ReplaceContentInput } from '../catalog/ebook-content.types';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { ContentExtractor } from '../extraction/content-extractor';
import { Book, BookStatus } from '../generated/prisma/client';
import { ChapterSummaryService } from '../indexing/chapter-summary.service';
import { ContentIndexingService } from '../indexing/content-indexing.service';
import { FileStorageService } from '../storage/file-storage.service';

export type IngestionStage = 'extract' | 'index';

export interface IngestionOutcome {
  stage: IngestionStage;
  chapters: number;
  embedded: number;
  remaining: number;
}

/**
 * O worker relança este erro para o BullMQ contar a tentativa: o conteúdo
 * parcial já está gravado e a próxima execução retoma só o que falta.
 */
export class IncompleteIndexingError extends Error {
  readonly remaining: number;

  constructor(remaining: number) {
    super(ContentIndexingService.incompleteMessage(remaining));
    this.name = 'IncompleteIndexingError';
    this.remaining = remaining;
  }
}

/**
 * Decide o estágio da ingestão pelo conteúdo já persistido: livro sem
 * capítulos extrai do storage; livro com capítulos apenas retoma os trechos
 * sem embedding. Não marca `failed` — isso é decisão de quem conhece o
 * número de tentativas restantes (o worker).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly contentRepository: EbookContentRepository,
    private readonly storage: FileStorageService,
    private readonly contentExtractor: ContentExtractor,
    private readonly indexing: ContentIndexingService,
    private readonly summaries: ChapterSummaryService,
  ) {}

  async process(bookId: string): Promise<IngestionOutcome> {
    const book = await this.ebookRepository.findById(bookId);
    if (!book) throw new EbookNotFoundError(bookId);

    await this.ebookRepository.updateStatus(bookId, BookStatus.PROCESSING);

    const chapterCount = await this.contentRepository.countChapters(bookId);
    const isExtractionStage = chapterCount === 0;
    const stage: IngestionStage = isExtractionStage ? 'extract' : 'index';

    this.logger.log(
      `Ingestão iniciada: bookId=${bookId}, estágio=${stage}, capítulos=${chapterCount}.`,
    );

    try {
      const outcome = isExtractionStage
        ? await this.runExtraction(book, bookId)
        : await this.runIndexing(bookId, chapterCount);

      this.logger.log(
        `Ingestão concluída: bookId=${bookId}, estágio=${outcome.stage}, capítulos=${outcome.chapters}, embeddings=${outcome.embedded}.`,
      );
      return outcome;
    } catch (error) {
      this.logFailure(bookId, stage, error);
      throw error;
    }
  }

  private async runExtraction(
    book: Book,
    bookId: string,
  ): Promise<IngestionOutcome> {
    const stream = await this.storage.get(book.storageKey);
    const content = await this.contentExtractor.extract({
      format: book.format,
      stream,
    });
    const prepared = await this.indexing.prepare(content.chapters);

    const replaceInput: ReplaceContentInput = {
      chapters: prepared.chapters,
      author: content.metadata.author,
      coverStorageKey: content.coverStorageKey,
    };
    if (content.metadata.title) replaceInput.title = content.metadata.title;

    // Grava o que conseguiu antes de decidir se a indexação está completa:
    // o parcial permanece para a próxima tentativa retomar.
    await this.contentRepository.replaceContent(bookId, replaceInput);

    // O erro de origem (ex.: IA desativada por falta de chave) é mais útil para
    // o usuário do que a contagem de trechos sem embedding.
    if (prepared.error) throw prepared.error;

    const hasRemainingChunks = prepared.remaining > 0;
    if (hasRemainingChunks) throw new IncompleteIndexingError(prepared.remaining);

    await this.generateSummaries(bookId);
    await this.markReady(bookId);

    return {
      stage: 'extract',
      chapters: prepared.chapters.length,
      embedded: prepared.embedded,
      remaining: 0,
    };
  }

  private async runIndexing(
    bookId: string,
    chapterCount: number,
  ): Promise<IngestionOutcome> {
    const outcome = await this.indexing.resumeMissing(bookId);

    if (outcome.error) throw outcome.error;

    const hasNoChunks = outcome.total === 0;
    const hasRemainingChunks = outcome.remaining > 0;
    if (hasNoChunks || hasRemainingChunks) {
      throw new IncompleteIndexingError(outcome.remaining);
    }

    await this.generateSummaries(bookId);
    await this.markReady(bookId);

    return {
      stage: 'index',
      chapters: chapterCount,
      embedded: outcome.embedded,
      remaining: 0,
    };
  }

  private async markReady(bookId: string): Promise<void> {
    await this.ebookRepository.updateStatus(bookId, BookStatus.READY);
  }

  /**
   * Resumo é melhoria do chat, não pré-requisito da leitura: falha aqui não
   * impede o livro de ficar pronto.
   */
  private async generateSummaries(bookId: string): Promise<void> {
    try {
      await this.summaries.summarizeBook(bookId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Ingestão concluída sem resumos: bookId=${bookId}, motivo=${reason}`,
      );
    }
  }

  private logFailure(
    bookId: string,
    stage: IngestionStage,
    error: unknown,
  ): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Ingestão falhou: bookId=${bookId}, estágio=${stage}, motivo=${reason}`,
    );
  }
}
