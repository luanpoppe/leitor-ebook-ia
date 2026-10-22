import type { Readable } from 'node:stream';
import type { BookFormat } from '../generated/prisma/client';

/**
 * Erros de domínio da extração de conteúdo.
 * Camadas superiores (services/jobs) traduzem este erro para o estado do ebook.
 */
export class ContentExtractionError extends Error {
  constructor(
    message = 'Não foi possível extrair o conteúdo do ebook informado.',
  ) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

export interface ExtractedChapter {
  position: number;
  title?: string | null;
  text: string;
}

export interface ExtractedCover {
  contentType: string;
  hash: string;
  extension: string;
  stream: Readable;
}

export interface ExtractedMetadata {
  title?: string;
  author?: string;
  cover?: ExtractedCover;
}

export interface ExtractionInput {
  format: BookFormat;
  stream: Readable;
}

export interface ExtractionResult {
  chapters: ExtractedChapter[];
  fullText: string;
  metadata: ExtractedMetadata;
}
