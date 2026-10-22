import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ChapterPageQueryDto,
  ChapterPositionParamsDto,
  type ChapterContentResponse,
  type ChapterListResponse,
} from './chapters.schemas';
import { EbookReadingService } from './ebook-reading.service';

/**
 * Superfície HTTP de leitura: sumário de capítulos e uma página de texto por
 * offset de caractere. Toda a regra fica no `EbookReadingService`; aqui só
 * entra a tradução de request/response.
 */
@ApiTags('chapters')
@Controller('ebooks/:bookId/chapters')
export class EbookChaptersController {
  constructor(private readonly readingService: EbookReadingService) {}

  @Get()
  @ApiOperation({ summary: 'Lista o sumário de capítulos do ebook' })
  @ApiResponse({ status: 200, description: 'Sumário de capítulos.' })
  @ApiResponse({ status: 404, description: 'Ebook não encontrado.' })
  list(@Param('bookId') bookId: string): Promise<ChapterListResponse> {
    return this.readingService.listChapters(bookId);
  }

  @Get(':position')
  @ApiOperation({ summary: 'Lê uma página de texto de um capítulo' })
  @ApiResponse({ status: 200, description: 'Página de texto do capítulo.' })
  @ApiResponse({ status: 400, description: 'Posição ou paginação inválida.' })
  @ApiResponse({
    status: 404,
    description: 'Ebook ou capítulo não encontrado.',
  })
  @ApiResponse({ status: 409, description: 'Ebook ainda não está pronto.' })
  read(
    @Param('bookId') bookId: string,
    @Param() params: ChapterPositionParamsDto,
    @Query() query: ChapterPageQueryDto,
  ): Promise<ChapterContentResponse> {
    return this.readingService.readChapter(bookId, params.position, {
      offset: query.offset,
      limit: query.limit,
    });
  }
}
