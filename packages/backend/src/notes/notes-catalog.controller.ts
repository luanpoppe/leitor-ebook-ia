import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AllNotesQueryDto,
  type NoteListWithBooksResponse,
} from './notes.schemas';
import { NotesService } from './notes.service';

/**
 * Lista global das anotações, para a página "Anotações" da estante. O CRUD
 * continua no escopo do livro (`/ebooks/:bookId/notes`).
 */
@ApiTags('notes')
@Controller('notes')
export class NotesCatalogController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as anotações de todos os livros' })
  @ApiResponse({ status: 200, description: 'Anotações com o livro de origem.' })
  async list(
    @Query() query: AllNotesQueryDto,
  ): Promise<NoteListWithBooksResponse> {
    const items = await this.notesService.listAll(
      query.q,
      query.bookId,
      query.limit,
    );

    return { items };
  }
}
