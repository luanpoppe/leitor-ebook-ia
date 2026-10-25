import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChapterReadingRepository } from '../catalog/chapter-reading.repository';
import { IndexingModule } from '../indexing/indexing.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChunkSearchRepository } from './chunk-search.repository';
import { ConversationRepository } from './conversation.repository';

@Module({
  imports: [CatalogModule, IndexingModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ConversationRepository,
    ChunkSearchRepository,
    ChapterReadingRepository,
  ],
})
export class ChatModule {}
