import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ImageService, type GeneratedImageResponse } from './image.service';

@ApiTags('images')
@Controller('ebooks/:bookId/images')
export class ImagesController {
  constructor(private readonly imageService: ImageService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as imagens geradas do livro' })
  @ApiResponse({ status: 200, description: 'Imagens do livro.' })
  list(
    @Param('bookId') bookId: string,
  ): Promise<{ items: GeneratedImageResponse[] }> {
    return this.imageService.list(bookId);
  }

  @Get(':imageId')
  @ApiOperation({ summary: 'Serve o arquivo da imagem gerada' })
  @ApiResponse({ status: 200, description: 'Imagem.' })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada.' })
  async file(
    @Param('bookId') bookId: string,
    @Param('imageId') imageId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.imageService.getFile(bookId, imageId);
    response.set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=3600',
    });

    return new StreamableFile(file.stream);
  }
}
