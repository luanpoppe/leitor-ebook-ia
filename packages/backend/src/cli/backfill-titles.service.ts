import { Injectable, Logger } from '@nestjs/common';
import {
  ChapterTitleInput,
  ChapterTitleRepository,
} from '../catalog/chapter-title.repository';
import { EbookContentRepository } from '../catalog/ebook-content.repository';
import { EbookRepository } from '../catalog/ebook.repository';
import { ContentExtractor } from '../extraction/content-extractor';
import type { ExtractedChapter } from '../extraction/content.types';
import type { Book } from '../generated/prisma/client';
import { FileStorageService } from '../storage/file-storage.service';

export interface BackfillSummary {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

type BackfillOutcome = 'updated' | 'skipped' | 'failed';

/**
 * Backfill manual e idempotente de `chapters.title` em livros já ingeridos.
 * Rebaixa o original do storage, extrai de novo e grava apenas o título,
 * casando por `position`. Nunca chama `replaceContent` nem mexe em chunks.
 */
@Injectable()
export class BackfillTitlesService {
  private readonly logger = new Logger(BackfillTitlesService.name);

  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly contentRepository: EbookContentRepository,
    private readonly chapterTitleRepository: ChapterTitleRepository,
    private readonly storage: FileStorageService,
    private readonly contentExtractor: ContentExtractor,
  ) {}

  async run(): Promise<BackfillSummary> {
    const summary: BackfillSummary = {
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    const books = await this.ebookRepository.findReadyForTitleBackfill();
    this.logger.log(
      `Backfill de títulos iniciado: ${books.length} livro(s) ready para verificar.`,
    );

    for (const book of books) {
      summary.scanned += 1;

      const outcome = await this.backfillBook(book);
      summary[outcome] += 1;
    }

    this.logger.log(
      `Backfill de títulos concluído: scanned=${summary.scanned}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}.`,
    );

    return summary;
  }

  /**
   * Isola a falha de um livro: o lote continua com os próximos.
   */
  private async backfillBook(book: Book): Promise<BackfillOutcome> {
    try {
      return await this.applyTitles(book);
    } catch (error) {
      this.logger.error(
        `Backfill de título falhou: bookId=${book.id} motivo=${this.toMessage(error)}`,
      );
      return 'failed';
    }
  }

  private async applyTitles(book: Book): Promise<BackfillOutcome> {
    const titledCount = await this.chapterTitleRepository.countTitledChapters(
      book.id,
    );
    const isAlreadyTitled = titledCount > 0;
    if (isAlreadyTitled) {
      this.logger.log(
        `Backfill ignorado: bookId=${book.id} já tem ${titledCount} capítulo(s) com título.`,
      );
      return 'skipped';
    }

    const currentCount = await this.contentRepository.countChapters(book.id);
    const stream = await this.storage.get(book.storageKey);
    const content = await this.contentExtractor.extract(
      {
        format: book.format,
        stream,
      },
      { persistCover: false },
    );

    const countsMatch = content.chapters.length === currentCount;
    if (!countsMatch) {
      this.logger.warn(
        `Backfill ignorado: bookId=${book.id} contagem de capítulos divergente (extraídos=${content.chapters.length}, atuais=${currentCount}).`,
      );
      return 'skipped';
    }

    const titles = this.collectTitles(content.chapters);
    const updatedCount = await this.chapterTitleRepository.updateMissingTitles(
      book.id,
      titles,
    );

    const hasUpdates = updatedCount > 0;
    if (!hasUpdates) {
      this.logger.log(
        `Backfill sem títulos novos: bookId=${book.id} extração não trouxe título.`,
      );
      return 'skipped';
    }

    this.logger.log(
      `Títulos gravados: bookId=${book.id} capítulos=${updatedCount}.`,
    );
    return 'updated';
  }

  private collectTitles(chapters: ExtractedChapter[]): ChapterTitleInput[] {
    const titles: ChapterTitleInput[] = [];

    for (const chapter of chapters) {
      const title = chapter.title;
      if (title == null) continue;

      titles.push({ position: chapter.position, title });
    }

    return titles;
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
