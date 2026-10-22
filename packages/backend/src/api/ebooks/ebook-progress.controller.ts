import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Put,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  SaveReadingProgressDto,
  type ReadingProgressResponse,
} from './progress.schemas';
import { ReadingProgressService } from './reading-progress.service';

/**
 * Superfície HTTP do progresso de leitura: ler e salvar o marcador de onde o
 * leitor parou. Toda a regra fica no `ReadingProgressService`; aqui só entra a
 * tradução de request/response — inclusive o 204 quando não há progresso.
 */
@ApiTags('progress')
@Controller('ebooks/:bookId/progress')
export class EbookProgressController {
  constructor(private readonly progressService: ReadingProgressService) {}

  // A resposta é escrita à mão porque o status é condicional: com
  // `passthrough`, o Nest reaplica o 200 padrão ao enviar o corpo e sobrescreve
  // o 204.
  @Get()
  @ApiOperation({ summary: 'Lê o progresso de leitura do ebook' })
  @ApiResponse({ status: 200, description: 'Progresso de leitura salvo.' })
  @ApiResponse({ status: 204, description: 'Ebook ainda não tem progresso.' })
  @ApiResponse({ status: 404, description: 'Ebook não encontrado.' })
  async get(
    @Param('bookId') bookId: string,
    @Res() response: Response,
  ): Promise<void> {
    const progress = await this.progressService.get(bookId);

    const hasProgress = progress !== null;
    if (!hasProgress) {
      response.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    response.status(HttpStatus.OK).json(progress);
  }

  @Put()
  @ApiOperation({ summary: 'Salva o progresso de leitura do ebook' })
  @ApiResponse({ status: 200, description: 'Progresso de leitura salvo.' })
  @ApiResponse({ status: 400, description: 'Corpo da requisição inválido.' })
  @ApiResponse({
    status: 404,
    description: 'Ebook ou capítulo não encontrado.',
  })
  @ApiResponse({
    status: 422,
    description: 'Offset além do fim do capítulo.',
  })
  save(
    @Param('bookId') bookId: string,
    @Body() body: SaveReadingProgressDto,
  ): Promise<ReadingProgressResponse> {
    return this.progressService.save(bookId, {
      chapterPosition: body.chapterPosition,
      offset: body.offset,
    });
  }
}
