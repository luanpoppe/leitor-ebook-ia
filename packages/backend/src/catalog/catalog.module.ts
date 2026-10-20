import { Module } from '@nestjs/common';
import { ChunkEmbeddingRepository } from './chunk-embedding.repository';
import { EbookContentRepository } from './ebook-content.repository';
import { EbookRepository } from './ebook.repository';

@Module({
  providers: [EbookRepository, EbookContentRepository, ChunkEmbeddingRepository],
  exports: [EbookRepository, EbookContentRepository, ChunkEmbeddingRepository],
})
export class CatalogModule {}
