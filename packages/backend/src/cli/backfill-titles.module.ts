import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { CatalogModule } from '../catalog/catalog.module';
import { ChapterTitleRepository } from '../catalog/chapter-title.repository';
import { CoreModule } from '../core/core.module';
import { ContentExtractionModule } from '../extraction/content-extraction.module';
import { FileStorageModule } from '../storage/file-storage.module';
import { BackfillTitlesService } from './backfill-titles.service';

/**
 * Contexto Nest do comando manual `backfill:titles`. Repete o carregamento de
 * env do `AppModule` porque roda fora do bootstrap HTTP.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '../../.env'), '.env'],
    }),
    CoreModule,
    CatalogModule,
    FileStorageModule,
    ContentExtractionModule,
  ],
  providers: [BackfillTitlesService, ChapterTitleRepository],
})
export class BackfillTitlesModule {}
