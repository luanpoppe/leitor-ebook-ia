import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChapterSummaryController } from './chapter-summary.controller';
import { ChapterSummaryService } from './chapter-summary.service';
import { ContentIndexingService } from './content-indexing.service';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [CatalogModule],
  controllers: [ChapterSummaryController],
  providers: [EmbeddingService, ContentIndexingService, ChapterSummaryService],
  exports: [ContentIndexingService, EmbeddingService, ChapterSummaryService],
})
export class IndexingModule {}
