import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import {
  AskQuestionDto,
  ConversationParamsDto,
  type AskQuestionResponse,
  type ConversationListResponse,
  type ConversationResponse,
} from './chat.schemas';

/**
 * Superfície HTTP do chat do livro. Toda a regra — recuperação de trechos,
 * prompt e persistência — fica no `ChatService`.
 */
@ApiTags('chat')
@Controller('ebooks/:bookId/conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as conversas do livro' })
  @ApiResponse({ status: 200, description: 'Conversas do livro.' })
  list(@Param('bookId') bookId: string): Promise<ConversationListResponse> {
    return this.chatService.listConversations(bookId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma conversa no livro' })
  @ApiResponse({ status: 201, description: 'Conversa criada.' })
  create(@Param('bookId') bookId: string): Promise<ConversationResponse> {
    return this.chatService.createConversation(bookId);
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Lê uma conversa com as mensagens' })
  @ApiResponse({ status: 200, description: 'Conversa com mensagens.' })
  @ApiResponse({ status: 404, description: 'Livro ou conversa não encontrada.' })
  get(
    @Param('bookId') bookId: string,
    @Param() params: ConversationParamsDto,
  ): Promise<ConversationResponse> {
    return this.chatService.getConversation(bookId, params.conversationId);
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Apaga uma conversa' })
  @ApiResponse({ status: 204, description: 'Conversa apagada.' })
  remove(
    @Param('bookId') bookId: string,
    @Param() params: ConversationParamsDto,
  ): Promise<void> {
    return this.chatService.deleteConversation(bookId, params.conversationId);
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Pergunta ao chat e grava a troca de mensagens' })
  @ApiResponse({ status: 201, description: 'Pergunta respondida.' })
  @ApiResponse({ status: 422, description: 'Nenhum trecho no escopo.' })
  @ApiResponse({ status: 503, description: 'IA indisponível.' })
  ask(
    @Param('bookId') bookId: string,
    @Param() params: ConversationParamsDto,
    @Body() body: AskQuestionDto,
  ): Promise<AskQuestionResponse> {
    return this.chatService.ask(bookId, params.conversationId, {
      question: body.question,
      scope: body.scope,
      position: body.position,
      offset: body.offset,
      contextStart: body.contextStart,
      contextEnd: body.contextEnd,
      selection: body.selection,
      selectionBefore: body.selectionBefore,
    });
  }
}
