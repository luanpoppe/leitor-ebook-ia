import { Module } from '@nestjs/common';
import { CatalogModule } from '../../catalog/catalog.module';
import { IngestionModule } from '../../ingestion/ingestion.module';
import { FileStorageModule } from '../../storage/file-storage.module';
import { EbookQueryService } from './ebook-query.service';
import { EbookUploadService } from './ebook-upload.service';
import { EbooksController } from './ebooks.controller';

@Module({
  imports: [CatalogModule, FileStorageModule, IngestionModule],
  controllers: [EbooksController],
  providers: [EbookUploadService, EbookQueryService],
})
export class EbooksModule {}
