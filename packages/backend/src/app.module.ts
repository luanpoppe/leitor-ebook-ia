import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { CatalogModule } from './catalog/catalog.module';
import { FileStorageModule } from './storage/file-storage.module';
import { ContentExtractionModule } from './extraction/content-extraction.module';
import { IndexingModule } from './indexing/indexing.module';

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
    IndexingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
