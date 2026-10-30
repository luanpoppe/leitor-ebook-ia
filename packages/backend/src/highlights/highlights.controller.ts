import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateHighlightDto,
  HighlightParamsDto,
  ListHighlightsQueryDto,
  UpdateHighlightDto,
  type HighlightListResponse,
  type HighlightResponse,
} from './highlights.schemas';
import { HighlightsService } from './highlights.service';

@ApiTags('highlights')
@Controller('ebooks/:bookId/highlights')
export class HighlightsController {
  constructor(private readonly highlightsService: HighlightsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as marcações do livro' })
  @ApiResponse({ status: 200, description: 'Marcações do livro.' })
  async list(
    @Param('bookId') bookId: string,
    @Query() query: ListHighlightsQueryDto,
  ): Promise<HighlightListResponse> {
    const items = await this.highlightsService.list(bookId, {
      query: query.q,
      color: query.color,
    });

    return { items };
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma marcação de texto no livro' })
  @ApiResponse({ status: 201, description: 'Marcação criada.' })
  create(
    @Param('bookId') bookId: string,
    @Body() body: CreateHighlightDto,
  ): Promise<HighlightResponse> {
    return this.highlightsService.create(bookId, body);
  }

  @Patch(':highlightId')
  @ApiOperation({ summary: 'Muda a cor de uma marcação' })
  @ApiResponse({ status: 200, description: 'Marcação atualizada.' })
  update(
    @Param('bookId') bookId: string,
    @Param() params: HighlightParamsDto,
    @Body() body: UpdateHighlightDto,
  ): Promise<HighlightResponse> {
    return this.highlightsService.update(bookId, params.highlightId, body);
  }

  @Delete(':highlightId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma marcação' })
  @ApiResponse({ status: 204, description: 'Marcação excluída.' })
  remove(
    @Param('bookId') bookId: string,
    @Param() params: HighlightParamsDto,
  ): Promise<void> {
    return this.highlightsService.remove(bookId, params.highlightId);
  }
}
