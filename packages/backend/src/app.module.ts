import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { CatalogModule } from './catalog/catalog.module';
import { FileStorageModule } from './storage/file-storage.module';
import { ContentExtractionModule } from './extraction/content-extraction.module';
import { IndexingModule } from './indexing/indexing.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { EbooksModule } from './api/ebooks/ebooks.module';
import { ChatModule } from './chat/chat.module';
import { ImagesModule } from './images/images.module';
import { SearchModule } from './search/search.module';
import { NotesModule } from './notes/notes.module';
import { DictionaryModule } from './dictionary/dictionary.module';

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
    IngestionModule,
    EbooksModule,
    ChatModule,
    SearchModule,
    ImagesModule,
    NotesModule,
    DictionaryModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
