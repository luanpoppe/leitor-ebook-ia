import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import {
  InvalidDictionaryChapterError,
  InvalidDictionaryWordError,
} from './dictionary.errors';
import {
  DictionaryRepository,
  type DictionaryEntryWithBook,
} from './dictionary.repository';
import type {
  DictionaryEntryResponse,
  SaveDictionaryInput,
} from './dictionary.schemas';

const WORD_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export interface SaveDictionaryResult {
  entry: DictionaryEntryResponse;
  created: boolean;
}

/**
 * Dicionário pessoal: uma entrada por palavra. Se a palavra já existe, a
 * entrada é atualizada com o novo significado/contexto em vez de duplicar.
 */
@Injectable()
export class DictionaryService {
  private readonly logger = new Logger(DictionaryService.name);

  constructor(
    private readonly dictionary: DictionaryRepository,
    private readonly ebooks: EbookRepository,
  ) {}

  async list(
    query?: string,
    bookId?: string,
  ): Promise<DictionaryEntryResponse[]> {
    const entries = await this.dictionary.list(query, bookId);

    return entries.map((entry) => this.toResponse(entry));
  }

  async findByWord(rawWord: string): Promise<DictionaryEntryResponse | null> {
    const word = this.cleanWord(rawWord);
    const normalizedWord = word.toLocaleLowerCase('pt-BR');
    const entry = await this.dictionary.findByNormalizedWord(normalizedWord);

    return entry === null ? null : this.toResponse(entry);
  }

  async attachImage(
    entryId: string,
    imageId: string,
  ): Promise<DictionaryEntryResponse> {
    const entry = await this.dictionary.attachImage(entryId, imageId);

    this.logger.log(
      `Imagem vinculada ao dicionário: entryId=${entry.id}, imagem=${imageId}.`,
    );

    return this.toResponse(entry);
  }

  async getImageId(entryId: string): Promise<string | null> {
    const entry = await this.dictionary.findById(entryId);
    if (entry === null) {
      throw new NotFoundException('Palavra não encontrada no dicionário.');
    }

    return entry.imageId;
  }

  async save(input: SaveDictionaryInput): Promise<SaveDictionaryResult> {
    const book = await this.ebooks.findById(input.bookId);
    if (book === null) throw new EbookNotFoundError(input.bookId);

    const word = this.cleanWord(input.word);
    const normalizedWord = word.toLocaleLowerCase('pt-BR');
    const chapterPosition = input.chapterPosition ?? null;
    if (chapterPosition !== null) {
      await this.assertChapter(input.bookId, chapterPosition);
    }

    const existing =
      await this.dictionary.findByNormalizedWord(normalizedWord);
    if (existing !== null) {
      const entry = await this.dictionary.update(existing.id, {
        word,
        meaning: input.meaning.trim(),
        example: this.cleanOptional(input.example),
        quote: this.cleanOptional(input.quote),
        bookId: input.bookId,
        chapterPosition,
      });

      this.logger.log(
        `Dicionário atualizado: bookId=${input.bookId}, entryId=${entry.id}, palavra="${word}".`,
      );

      return { entry: this.toResponse(entry), created: false };
    }

    const entry = await this.dictionary.create({
      word,
      normalizedWord,
      meaning: input.meaning.trim(),
      example: this.cleanOptional(input.example),
      quote: this.cleanOptional(input.quote),
      bookId: input.bookId,
      chapterPosition,
    });

    this.logger.log(
      `Dicionário criado: bookId=${input.bookId}, entryId=${entry.id}, palavra="${word}".`,
    );

    return { entry: this.toResponse(entry), created: true };
  }

  private cleanWord(rawWord: string): string {
    const withoutEdges = rawWord.trim().replace(WORD_EDGE_PUNCTUATION, '');
    const normalizedSpaces = withoutEdges.replace(/\s+/g, ' ').trim();
    if (normalizedSpaces.length === 0) {
      throw new InvalidDictionaryWordError();
    }

    return normalizedSpaces;
  }

  private cleanOptional(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private async assertChapter(
    bookId: string,
    chapterPosition: number,
  ): Promise<void> {
    const exists = await this.dictionary.chapterExists(
      bookId,
      chapterPosition,
    );
    if (!exists) throw new InvalidDictionaryChapterError(bookId, chapterPosition);
  }

  private toResponse(entry: DictionaryEntryWithBook): DictionaryEntryResponse {
    return {
      id: entry.id,
      word: entry.word,
      meaning: entry.meaning,
      example: entry.example,
      quote: entry.quote,
      chapterPosition: entry.chapterPosition,
      book: entry.book,
      imageUrl:
        entry.imageId === null ? null : `/dictionary/${entry.id}/image`,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
