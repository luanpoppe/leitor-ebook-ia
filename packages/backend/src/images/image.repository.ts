import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

export interface StoredImage {
  id: string;
  prompt: string;
  model: string;
  storageKey: string;
  createdAt: Date;
}

@Injectable()
export class ImageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    bookId: string;
    conversationId: string;
    prompt: string;
    model: string;
    storageKey: string;
  }): Promise<StoredImage> {
    return this.prisma.generatedImage.create({
      data: input,
      select: {
        id: true,
        prompt: true,
        model: true,
        storageKey: true,
        createdAt: true,
      },
    });
  }

  async listByBook(bookId: string): Promise<StoredImage[]> {
    return this.prisma.generatedImage.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prompt: true,
        model: true,
        storageKey: true,
        createdAt: true,
      },
    });
  }

  async findById(bookId: string, imageId: string): Promise<StoredImage | null> {
    return this.prisma.generatedImage.findFirst({
      where: { id: imageId, bookId },
      select: {
        id: true,
        prompt: true,
        model: true,
        storageKey: true,
        createdAt: true,
      },
    });
  }
}
