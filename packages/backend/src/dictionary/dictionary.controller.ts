import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ImageService } from '../images/image.service';
import {
  DictionaryEntryParamsDto,
  ListDictionaryQueryDto,
  type DictionaryListResponse,
} from './dictionary.schemas';
import { DictionaryService } from './dictionary.service';

@ApiTags('dictionary')
@Controller('dictionary')
export class DictionaryController {
  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly imageService: ImageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as palavras do dicionário pessoal' })
  @ApiResponse({ status: 200, description: 'Palavras com o livro de origem.' })
  async list(
    @Query() query: ListDictionaryQueryDto,
  ): Promise<DictionaryListResponse> {
    const items = await this.dictionaryService.list(query.q, query.bookId);

    return { items };
  }

  @Get(':entryId/image')
  @ApiOperation({ summary: 'Serve a imagem gerada de uma palavra' })
  @ApiResponse({ status: 200, description: 'Imagem da palavra.' })
  @ApiResponse({ status: 404, description: 'Palavra ou imagem não encontrada.' })
  async image(
    @Param() params: DictionaryEntryParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const imageId = await this.dictionaryService.getImageId(params.entryId);
    if (imageId === null) {
      throw new NotFoundException('Esta palavra ainda não tem imagem.');
    }

    const file = await this.imageService.getFileById(imageId);
    response.set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=3600',
    });

    return new StreamableFile(file.stream);
  }
}
