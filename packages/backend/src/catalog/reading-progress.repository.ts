import { Injectable } from '@nestjs/common';
import { ReadingProgress } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';

export interface SaveReadingProgressInput {
  chapterPosition: number;
  offset: number;
}

/**
 * Persistência do progresso de leitura por ebook: um registro por livro
 * (o progresso mais avançado é o que interessa para retomar a leitura).
 */
@Injectable()
export class ReadingProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBookId(bookId: string): Promise<ReadingProgress | null> {
    return this.prisma.readingProgress.findUnique({ where: { bookId } });
  }

  // O contrato usa `offset`, mas a coluna é `char_offset` porque OFFSET é
  // palavra-chave SQL; a tradução acontece só aqui, na borda do banco.
  async upsert(
    bookId: string,
    input: SaveReadingProgressInput,
  ): Promise<ReadingProgress> {
    return this.prisma.readingProgress.upsert({
      where: { bookId },
      create: {
        bookId,
        chapterPosition: input.chapterPosition,
        charOffset: input.offset,
      },
      update: {
        chapterPosition: input.chapterPosition,
        charOffset: input.offset,
      },
    });
  }
}
