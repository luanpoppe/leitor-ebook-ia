import { BookStatus } from '../generated/prisma/client';

/**
 * Tipos de entrada e saída do conteúdo persistido de um ebook
 * (capítulos e chunks). `embedding` ausente ou nulo significa
 * trecho ainda não vetorizado.
 */

export interface ReplaceContentChunkInput {
  position: number;
  text: string;
  embedding?: number[] | null;
}

export interface ReplaceContentChapterInput {
  position: number;
  title?: string | null;
  text: string;
  chunks: ReplaceContentChunkInput[];
}

export interface ReplaceContentInput {
  chapters: ReplaceContentChapterInput[];
  fullText?: string;
  fullTextChunks?: ReplaceContentChunkInput[];
  title?: string;
  author?: string | null;
  coverStorageKey?: string | null;
  status?: BookStatus;
  errorMessage?: string | null;
}

export interface MissingEmbeddingChunk {
  id: string;
  chapterPosition: number;
  position: number;
  text: string;
}

export interface ChunkEmbeddingUpdate {
  chunkId: string;
  embedding: number[];
}
