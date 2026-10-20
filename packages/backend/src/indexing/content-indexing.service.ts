import { Injectable, Logger } from '@nestjs/common';
import { EbookContentRepository } from '../catalog/ebook-content.repository';
import type {
  ChunkEmbeddingUpdate,
  MissingEmbeddingChunk,
} from '../catalog/ebook-content.types';
import type { ExtractedChapter } from '../extraction/content.types';
import { EmbeddingService } from './embedding.service';
import { EmbeddingUnavailableError } from './indexing.errors';
import { ChapterChunks, TextChunker } from './text-chunker';

export interface IndexedChunk {
  position: number;
  text: string;
  embedding?: number[];
}

export interface IndexedChapter {
  position: number;
  text: string;
  chunks: IndexedChunk[];
}

export interface IndexingOutcome {
  embedded: number;
  missing: number;
  error?: EmbeddingUnavailableError;
}

export interface PreparedContent extends IndexingOutcome {
  chapters: IndexedChapter[];
}

/** Mesma forma do `IndexingOutcome`; alias evita a interface vazia, proibida pelo lint. */
export type ResumeOutcome = IndexingOutcome;

interface EmbeddingAttempt {
  vectors: number[][];
  error?: EmbeddingUnavailableError;
}

interface PersistedAttempt {
  embedded: number;
  error?: EmbeddingUnavailableError;
}

/**
 * Divide os capítulos em trechos e gera o embedding de cada um. A retomada
 * nunca reescreve o conteúdo: refazer `replaceContent` apagaria em cascata os
 * embeddings já pagos.
 */
@Injectable()
export class ContentIndexingService {
  private readonly logger = new Logger(ContentIndexingService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly ebookContentRepository: EbookContentRepository,
  ) {}

  /**
   * Falha da IA não interrompe: os trechos sem vetor voltam sem `embedding`.
   */
  async prepare(chapters: ExtractedChapter[]): Promise<PreparedContent> {
    const chapterChunks = TextChunker.chunkChapters(chapters);
    const chunkTexts = chapterChunks.flatMap((chapterChunk) =>
      chapterChunk.chunks.map((draft) => draft.text),
    );

    const hasChunkTexts = chunkTexts.length > 0;
    if (!hasChunkTexts) return { chapters: [], embedded: 0, missing: 0 };

    const attempt = await this.embedSafely(chunkTexts);
    const indexedChapters = ContentIndexingService.buildIndexedChapters(
      chapters,
      chapterChunks,
      attempt.vectors,
    );

    const embedded = attempt.vectors.length;
    const missing = chunkTexts.length - embedded;
    this.logger.log(
      `Indexação preparada: ${chapterChunks.length} capítulo(s), ${chunkTexts.length} trecho(s), ${embedded} embedding(s), ${missing} sem vetor.`,
    );

    const prepared: PreparedContent = { chapters: indexedChapters, embedded, missing };
    if (attempt.error) prepared.error = attempt.error;

    return prepared;
  }

  /**
   * Envia à API apenas os trechos sem vetor, grava o que conseguiu e devolve
   * quantos ainda restam. Não lança `EmbeddingUnavailableError`.
   */
  async resumeMissing(bookId: string): Promise<ResumeOutcome> {
    const missingChunks =
      await this.ebookContentRepository.findChunksWithoutEmbedding(bookId);

    const hasMissingChunks = missingChunks.length > 0;
    if (!hasMissingChunks) {
      this.logger.log(
        `Retomada do ebook ${bookId}: nenhum trecho sem embedding.`,
      );
      return { embedded: 0, missing: 0 };
    }

    const attempt = await this.embedAndPersistInBatches(missingChunks);
    const remaining =
      await this.ebookContentRepository.countChunksWithoutEmbedding(bookId);

    this.logger.log(
      `Retomada do ebook ${bookId}: ${missingChunks.length} trecho(s) sem vetor, ${attempt.embedded} embedding(s) gravado(s), ${remaining} restante(s).`,
    );

    const outcome: ResumeOutcome = {
      embedded: attempt.embedded,
      missing: remaining,
    };
    if (attempt.error) outcome.error = attempt.error;

    return outcome;
  }

  static incompleteMessage(missing: number): string {
    return `Indexação incompleta: ${missing} trechos sem embedding.`;
  }

  /**
   * Gera os vetores lote a lote, acumulando o que já veio. Falha da IA vira
   * resultado parcial; qualquer outro erro sobe.
   */
  private async embedSafely(texts: string[]): Promise<EmbeddingAttempt> {
    const batches = EmbeddingService.batchTexts(texts);
    const vectors: number[][] = [];

    for (const batch of batches) {
      try {
        const batchVectors = await this.embeddingService.embedBatch(batch);
        vectors.push(...batchVectors);
      } catch (error) {
        const isUnavailable = error instanceof EmbeddingUnavailableError;
        if (!isUnavailable) throw error;

        const missing = texts.length - vectors.length;
        this.logger.warn(
          `Falha ao gerar embeddings de um lote: ${error.message}. ${vectors.length} embedding(s) preservado(s), ${missing} trecho(s) sem vetor.`,
        );
        return { vectors, error };
      }
    }

    return { vectors };
  }

  /**
   * Gera e grava um lote por vez: se um lote falhar, o que já foi gravado
   * permanece no banco e a retomada seguinte continua só do ponto pendente.
   */
  private async embedAndPersistInBatches(
    chunks: MissingEmbeddingChunk[],
  ): Promise<PersistedAttempt> {
    const texts = chunks.map((chunk) => chunk.text);
    const batches = EmbeddingService.batchTexts(texts);
    let embedded = 0;
    let offset = 0;

    for (const batch of batches) {
      const batchChunks = chunks.slice(offset, offset + batch.length);

      let batchVectors: number[][];
      try {
        batchVectors = await this.embeddingService.embedBatch(batch);
      } catch (error) {
        const isUnavailable = error instanceof EmbeddingUnavailableError;
        if (!isUnavailable) throw error;

        this.logger.warn(
          `Falha ao gerar embeddings de um lote: ${error.message}. ${embedded} embedding(s) já gravado(s) preservado(s).`,
        );
        return { embedded, error };
      }

      const affected = await this.persistEmbeddings(batchChunks, batchVectors);
      embedded += affected;
      offset += batch.length;
    }

    return { embedded };
  }

  /** Um lote de vetores, na mesma ordem dos chunks recebidos. */
  private async persistEmbeddings(
    chunks: MissingEmbeddingChunk[],
    vectors: number[][],
  ): Promise<number> {
    const updates: ChunkEmbeddingUpdate[] = [];

    for (const [index, chunk] of chunks.entries()) {
      const embedding = vectors[index];
      if (!embedding) continue;

      updates.push({ chunkId: chunk.id, embedding });
    }

    return this.ebookContentRepository.updateChunkEmbeddings(updates);
  }

  private static buildIndexedChapters(
    chapters: ExtractedChapter[],
    chapterChunks: ChapterChunks[],
    vectors: number[][],
  ): IndexedChapter[] {
    const textByPosition = new Map(chapters.map((c) => [c.position, c.text]));
    const indexedChapters: IndexedChapter[] = [];
    let vectorIndex = 0;

    for (const chapterChunk of chapterChunks) {
      const chunks: IndexedChunk[] = [];

      for (const draft of chapterChunk.chunks) {
        const embedding = vectors[vectorIndex];
        vectorIndex += 1;

        const chunk: IndexedChunk = { position: draft.position, text: draft.text };
        if (embedding) chunk.embedding = embedding;
        chunks.push(chunk);
      }

      const chapterText = textByPosition.get(chapterChunk.chapterPosition) ?? '';
      indexedChapters.push({
        position: chapterChunk.chapterPosition,
        text: chapterText,
        chunks,
      });
    }

    return indexedChapters;
  }
}
