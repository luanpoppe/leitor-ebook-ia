import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ConversationListWithBooksResponse } from './chat.schemas';
import { ChatService } from './chat.service';

/**
 * Lista global de conversas, usada pela página "Conversas" da estante. O
 * conteúdo e o envio de mensagens continuam no escopo do livro.
 */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as conversas de todos os livros' })
  @ApiResponse({ status: 200, description: 'Conversas com o livro de origem.' })
  list(): Promise<ConversationListWithBooksResponse> {
    return this.chatService.listAllConversations();
  }
}
