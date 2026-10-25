import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentIndexingService } from './content-indexing.service';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [CatalogModule],
  providers: [EmbeddingService, ContentIndexingService],
  exports: [ContentIndexingService, EmbeddingService],
})
export class IndexingModule {}
