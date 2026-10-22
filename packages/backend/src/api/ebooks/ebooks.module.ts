import { Module } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { CatalogModule } from '../../catalog/catalog.module';
import { ChapterReadingRepository } from '../../catalog/chapter-reading.repository';
import { IngestionModule } from '../../ingestion/ingestion.module';
import { FileStorageModule } from '../../storage/file-storage.module';
import { EbookChaptersController } from './ebook-chapters.controller';
import { EbookQueryService } from './ebook-query.service';
import { EbookReadingService } from './ebook-reading.service';
import { EbookUploadService } from './ebook-upload.service';
import { EbooksController } from './ebooks.controller';
import { EbooksExceptionFilter } from './ebooks-exception.filter';

/**
 * O filtro é registrado como `APP_FILTER` (e não no controller) para traduzir
 * também os erros que estouram antes do handler — multer, por exemplo — e para
 * que `super.catch` receba o adapter HTTP do próprio framework.
 */
@Module({
  imports: [CatalogModule, FileStorageModule, IngestionModule],
  controllers: [EbooksController, EbookChaptersController],
  providers: [
    EbookUploadService,
    EbookQueryService,
    EbookReadingService,
    ChapterReadingRepository,
    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost],
      useFactory: (adapterHost: HttpAdapterHost) =>
        new EbooksExceptionFilter(adapterHost.httpAdapter),
    },
  ],
})
export class EbooksModule {}
