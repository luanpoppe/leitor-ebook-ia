import { Module } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { CatalogModule } from '../../catalog/catalog.module';
import { ChapterReadingRepository } from '../../catalog/chapter-reading.repository';
import { ReadingProgressRepository } from '../../catalog/reading-progress.repository';
import { IngestionModule } from '../../ingestion/ingestion.module';
import { FileStorageModule } from '../../storage/file-storage.module';
import { EbookChaptersController } from './ebook-chapters.controller';
import { EbookProgressController } from './ebook-progress.controller';
import { EbookQueryService } from './ebook-query.service';
import { EbookReadingService } from './ebook-reading.service';
import { EbookUploadService } from './ebook-upload.service';
import { EbooksController } from './ebooks.controller';
import { EbooksExceptionFilter } from './ebooks-exception.filter';
import { ReadingProgressService } from './reading-progress.service';

/**
 * O filtro é registrado como `APP_FILTER` (e não no controller) para traduzir
 * também os erros que estouram antes do handler — multer, por exemplo — e para
 * que `super.catch` receba o adapter HTTP do próprio framework.
 */
@Module({
  imports: [CatalogModule, FileStorageModule, IngestionModule],
  controllers: [
    EbooksController,
    EbookChaptersController,
    EbookProgressController,
  ],
  providers: [
    EbookUploadService,
    EbookQueryService,
    EbookReadingService,
    ChapterReadingRepository,
    ReadingProgressService,
    // Não exportado pelo `CatalogModule`: a persistência do progresso só é
    // usada por este módulo, então é provida aqui.
    ReadingProgressRepository,
    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost],
      useFactory: (adapterHost: HttpAdapterHost) =>
        new EbooksExceptionFilter(adapterHost.httpAdapter),
    },
  ],
})
export class EbooksModule {}
