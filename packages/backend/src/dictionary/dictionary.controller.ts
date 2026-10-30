import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ListDictionaryQueryDto,
  type DictionaryListResponse,
} from './dictionary.schemas';
import { DictionaryService } from './dictionary.service';

@ApiTags('dictionary')
@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as palavras do dicionário pessoal' })
  @ApiResponse({ status: 200, description: 'Palavras com o livro de origem.' })
  async list(
    @Query() query: ListDictionaryQueryDto,
  ): Promise<DictionaryListResponse> {
    const items = await this.dictionaryService.list(query.q, query.bookId);

    return { items };
  }
}
