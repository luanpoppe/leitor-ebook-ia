import { Injectable } from '@nestjs/common';
import {
  ChapterNotFoundError,
  EbookNotFoundError,
  InvalidReadingProgressError,
} from '../../catalog/catalog.errors';
import { ChapterReadingRepository } from '../../catalog/chapter-reading.repository';
import { EbookRepository } from '../../catalog/ebook.repository';
import { ReadingProgressRepository } from '../../catalog/reading-progress.repository';
import type { SaveReadingProgressInput } from '../../catalog/reading-progress.repository';
import type { ReadingProgress } from '../../generated/prisma/client';
import type { ReadingProgressResponse } from './progress.schemas';

/**
 * Progresso de leitura do ebook: o marcador de onde o leitor parou.
 * Um livro só precisa existir — não precisa estar READY, porque o progresso
 * é apenas um marcador e não altera o conteúdo do ebook.
 */
@Injectable()
export class ReadingProgressService {
  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly progressRepository: ReadingProgressRepository,
    private readonly chapterRepository: ChapterReadingRepository,
  ) {}

  async get(bookId: string): Promise<ReadingProgressResponse | null> {
    await this.assertBookExists(bookId);

    const progress = await this.progressRepository.findByBookId(bookId);
    if (progress === null) return null;

    return this.toResponse(progress);
  }

  async save(
    bookId: string,
    input: SaveReadingProgressInput,
  ): Promise<ReadingProgressResponse> {
    await this.assertBookExists(bookId);

    const chapterLength = await this.chapterRepository.findChapterLength(
      bookId,
      input.chapterPosition,
    );
    if (chapterLength === null) {
      throw new ChapterNotFoundError(bookId, input.chapterPosition);
    }

    // `offset === chapterLength` é o fim do capítulo e é válido; só ultrapassar
    // o tamanho é inválido.
    const isOffsetBeyondChapter = input.offset > chapterLength;
    if (isOffsetBeyondChapter) {
      throw new InvalidReadingProgressError(
        bookId,
        input.chapterPosition,
        input.offset,
        chapterLength,
      );
    }

    const saved = await this.progressRepository.upsert(bookId, input);

    return this.toResponse(saved);
  }

  private async assertBookExists(bookId: string): Promise<void> {
    const book = await this.ebookRepository.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);
  }

  private toResponse(progress: ReadingProgress): ReadingProgressResponse {
    return {
      bookId: progress.bookId,
      chapterPosition: progress.chapterPosition,
      offset: progress.charOffset,
      updatedAt: progress.updatedAt.toISOString(),
    };
  }
}
