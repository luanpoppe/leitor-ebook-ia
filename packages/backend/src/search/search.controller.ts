import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchQueryDto, type SearchResponse } from './search.schemas';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('ebooks/:bookId/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Busca um termo ou frase no livro (sem caixa)' })
  @ApiResponse({ status: 200, description: 'Ocorrências com trecho de contexto.' })
  search(
    @Param('bookId') bookId: string,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponse> {
    return this.searchService.search(bookId, query.q, query.limit);
  }
}
