import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { EbookQueryService } from './ebook-query.service';
import type { UploadedEbookFile } from './ebook-upload.service';
import { EbookUploadService } from './ebook-upload.service';
import {
  ListEbooksQueryDto,
  type EbookDetail,
  type PagedEbooks,
  type ReprocessEbookResponse,
  type UploadEbookResponse,
} from './ebooks.schemas';

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

const UPLOAD_INTERCEPTOR_OPTIONS = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
};

const UPLOAD_BODY_SCHEMA = {
  type: 'object',
  required: ['file'],
  properties: {
    file: { type: 'string', format: 'binary' },
  },
};

const BOOK_ID_PARAM = ':id';

/**
 * Superfície HTTP da estante: upload, listagem, detalhe e reprocessamento.
 * Toda a regra fica nos services; aqui só entra a tradução de request/response.
 */
@ApiTags('ebooks')
@Controller('ebooks')
export class EbooksController {
  constructor(
    private readonly uploadService: EbookUploadService,
    private readonly queryService: EbookQueryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envia um ebook e enfileira a ingestão' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: UPLOAD_BODY_SCHEMA })
  @ApiResponse({ status: 202, description: 'Upload aceito e enfileirado.' })
  @ApiResponse({ status: 400, description: 'Arquivo ausente no campo "file".' })
  @ApiResponse({ status: 409, description: 'Ebook já está na estante.' })
  @ApiResponse({ status: 413, description: 'Arquivo acima de 50 MB.' })
  @ApiResponse({ status: 422, description: 'Formato não suportado ou vazio.' })
  @UseInterceptors(FileInterceptor('file', UPLOAD_INTERCEPTOR_OPTIONS))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UploadEbookResponse> {
    if (!file) throw new BadRequestException('Envie o arquivo no campo "file".');

    const uploadedFile: UploadedEbookFile = {
      path: file.path,
      originalname: file.originalname,
      size: file.size,
    };
    const result = await this.uploadService.upload(uploadedFile);

    response.setHeader('Location', `/ebooks/${result.id}`);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Lista a estante de forma paginada' })
  @ApiResponse({ status: 200, description: 'Página da estante.' })
  list(@Query() query: ListEbooksQueryDto): Promise<PagedEbooks> {
    return this.queryService.list({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(BOOK_ID_PARAM)
  @ApiOperation({ summary: 'Detalha um ebook pelo id' })
  @ApiResponse({ status: 200, description: 'Detalhe do ebook.' })
  @ApiResponse({ status: 404, description: 'Ebook não encontrado.' })
  findById(@Param('id') id: string): Promise<EbookDetail> {
    return this.queryService.findById(id);
  }

  @Post(`${BOOK_ID_PARAM}/reprocess`)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reprocessa um ebook que falhou' })
  @ApiResponse({ status: 202, description: 'Reprocessamento enfileirado.' })
  @ApiResponse({ status: 404, description: 'Ebook não encontrado.' })
  @ApiResponse({ status: 409, description: 'Ebook não está em falha.' })
  reprocess(@Param('id') id: string): Promise<ReprocessEbookResponse> {
    return this.uploadService.reprocess(id);
  }
}
