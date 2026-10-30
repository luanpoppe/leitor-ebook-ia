import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AllHighlightsQueryDto,
  type HighlightListWithBooksResponse,
} from './highlights.schemas';
import { HighlightsService } from './highlights.service';

/**
 * Lista global das marcações, para a página "Marcações" da estante. O CRUD
 * continua no escopo do livro (`/ebooks/:bookId/highlights`).
 */
@ApiTags('highlights')
@Controller('highlights')
export class HighlightsCatalogController {
  constructor(private readonly highlightsService: HighlightsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as marcações de todos os livros' })
  @ApiResponse({ status: 200, description: 'Marcações com o livro de origem.' })
  list(
    @Query() query: AllHighlightsQueryDto,
  ): Promise<HighlightListWithBooksResponse> {
    return this.highlightsService.listAll(
      { query: query.q, color: query.color },
      query.bookId,
      query.limit,
    );
  }
}
