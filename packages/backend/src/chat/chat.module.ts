import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChapterReadingRepository } from '../catalog/chapter-reading.repository';
import { ImagesModule } from '../images/images.module';
import { IndexingModule } from '../indexing/indexing.module';
import { SearchModule } from '../search/search.module';
import { ChatController } from './chat.controller';
import { ChatQueryPlanner } from './chat-query-planner';
import { ChatService } from './chat.service';
import { ChunkSearchRepository } from './chunk-search.repository';
import { ConversationRepository } from './conversation.repository';

@Module({
  imports: [CatalogModule, IndexingModule, SearchModule, ImagesModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatQueryPlanner,
    ConversationRepository,
    ChunkSearchRepository,
    ChapterReadingRepository,
  ],
})
export class ChatModule {}
