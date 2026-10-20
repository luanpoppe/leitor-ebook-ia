import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentExtractionModule } from '../extraction/content-extraction.module';
import { IndexingModule } from '../indexing/indexing.module';
import { FileStorageModule } from '../storage/file-storage.module';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionQueue } from './ingestion.queue';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [
    CatalogModule,
    FileStorageModule,
    ContentExtractionModule,
    IndexingModule,
  ],
  providers: [IngestionQueue, IngestionService, IngestionProcessor],
  exports: [IngestionQueue, IngestionService],
})
export class IngestionModule {}
