import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, NotFoundException } from '@nestjs/common';
import { FileStorageService } from '../storage/file-storage.service';
import { ImageGenerationService } from './image-generation.service';
import { ImageRepository, type StoredImage } from './image.repository';

const STORAGE_PREFIX = 'generated-images';

export interface GeneratedImageResponse {
  id: string;
  prompt: string;
  model: string;
  createdAt: string;
  /** URL relativa servida pelo backend (a UI prefixa a base da API). */
  url: string;
}

@Injectable()
export class ImageService {
  constructor(
    private readonly generation: ImageGenerationService,
    private readonly repository: ImageRepository,
    private readonly storage: FileStorageService,
  ) {}

  async generate(input: {
    bookId: string;
    conversationId?: string | null;
    prompt: string;
  }): Promise<GeneratedImageResponse> {
    const file = await this.generation.generate(input.prompt);
    const imageId = randomUUID();
    const extension = file.contentType === 'image/jpeg' ? 'jpg' : 'png';
    // O storage aceita "<prefixo>/<arquivo>" (só um nível).
    const storageKey = `${STORAGE_PREFIX}/${input.bookId}-${imageId}.${extension}`;

    await this.storage.putObject({
      storageKey,
      contentType: file.contentType,
      stream: Readable.from(file.buffer),
      size: file.buffer.length,
    });

    const record = await this.repository.create({
      bookId: input.bookId,
      conversationId: input.conversationId ?? null,
      prompt: input.prompt,
      model: this.generation.model,
      storageKey,
    });

    return this.toResponse(input.bookId, record);
  }

  async list(bookId: string): Promise<{ items: GeneratedImageResponse[] }> {
    const images = await this.repository.listByBook(bookId);

    return {
      items: images.map((image) => this.toResponse(bookId, image)),
    };
  }

  async getFile(
    bookId: string,
    imageId: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const image = await this.repository.findById(bookId, imageId);
    if (image === null) {
      throw new NotFoundException(`Imagem ${imageId} não encontrada.`);
    }

    return {
      stream: await this.storage.get(image.storageKey),
      contentType: image.storageKey.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    };
  }

  async getFileById(
    imageId: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const image = await this.repository.findByIdAny(imageId);
    if (image === null) {
      throw new NotFoundException(`Imagem ${imageId} não encontrada.`);
    }

    return {
      stream: await this.storage.get(image.storageKey),
      contentType: image.storageKey.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    };
  }

  private toResponse(
    bookId: string,
    image: StoredImage,
  ): GeneratedImageResponse {
    return {
      id: image.id,
      prompt: image.prompt,
      model: image.model,
      createdAt: image.createdAt.toISOString(),
      url: `/ebooks/${bookId}/images/${image.id}`,
    };
  }
}
