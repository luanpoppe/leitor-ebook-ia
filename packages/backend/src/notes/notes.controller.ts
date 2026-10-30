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
  CreateNoteDto,
  ListNotesQueryDto,
  NoteParamsDto,
  UpdateNoteDto,
  type NoteListResponse,
  type NoteResponse,
} from './notes.schemas';
import { NotesService } from './notes.service';

@ApiTags('notes')
@Controller('ebooks/:bookId/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as anotações do livro' })
  @ApiResponse({ status: 200, description: 'Anotações do livro.' })
  async list(
    @Param('bookId') bookId: string,
    @Query() query: ListNotesQueryDto,
  ): Promise<NoteListResponse> {
    const items = await this.notesService.list(bookId, query.q);

    return { items };
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma anotação no livro' })
  @ApiResponse({ status: 201, description: 'Anotação criada.' })
  create(
    @Param('bookId') bookId: string,
    @Body() body: CreateNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.create(bookId, body);
  }

  @Get(':noteId')
  @ApiOperation({ summary: 'Lê uma anotação' })
  @ApiResponse({ status: 200, description: 'Anotação do livro.' })
  @ApiResponse({ status: 404, description: 'Livro ou anotação não encontrada.' })
  get(
    @Param('bookId') bookId: string,
    @Param() params: NoteParamsDto,
  ): Promise<NoteResponse> {
    return this.notesService.get(bookId, params.noteId);
  }

  @Patch(':noteId')
  @ApiOperation({ summary: 'Edita uma anotação' })
  @ApiResponse({ status: 200, description: 'Anotação atualizada.' })
  @ApiResponse({ status: 404, description: 'Livro ou anotação não encontrada.' })
  update(
    @Param('bookId') bookId: string,
    @Param() params: NoteParamsDto,
    @Body() body: UpdateNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.update(bookId, params.noteId, body);
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma anotação' })
  @ApiResponse({ status: 204, description: 'Anotação excluída.' })
  @ApiResponse({ status: 404, description: 'Livro ou anotação não encontrada.' })
  remove(
    @Param('bookId') bookId: string,
    @Param() params: NoteParamsDto,
  ): Promise<void> {
    return this.notesService.remove(bookId, params.noteId);
  }
}
