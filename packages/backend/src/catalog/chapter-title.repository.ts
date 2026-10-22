import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

export interface ChapterTitleInput {
  position: number;
  title: string;
}

/**
 * Escrita restrita a `chapters.title`, usada apenas pelo backfill manual de
 * títulos de livros já ingeridos. Não toca em texto, chunks nem embeddings.
 */
@Injectable()
export class ChapterTitleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countTitledChapters(bookId: string): Promise<number> {
    return this.prisma.chapter.count({
      where: { bookId, title: { not: null } },
    });
  }

  /**
   * A guarda `title: null` no `where` torna o update idempotente: só capítulos
   * ainda sem título são gravados, então rodar o comando de novo não sobrescreve
   * título já existente (e cada `count` só soma linhas realmente alteradas).
   */
  async updateMissingTitles(
    bookId: string,
    titles: ChapterTitleInput[],
  ): Promise<number> {
    const hasTitles = titles.length > 0;
    if (!hasTitles) return 0;

    const updates = titles.map((entry) =>
      this.prisma.chapter.updateMany({
        where: { bookId, position: entry.position, title: null },
        data: { title: entry.title },
      }),
    );

    const results = await this.prisma.$transaction(updates);

    return results.reduce((total, result) => total + result.count, 0);
  }
}
