import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChapterSummaryService } from './chapter-summary.service';

/**
 * Backfill dos resumos de um livro já pronto (o upload já gera sozinho). Roda
 * em background porque são várias chamadas de modelo; a resposta só confirma
 * que começou.
 */
@ApiTags('ebooks')
@Controller('ebooks/:bookId/summaries')
export class ChapterSummaryController {
  private readonly logger = new Logger(ChapterSummaryController.name);

  constructor(private readonly summaries: ChapterSummaryService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Gera em background os resumos que faltam' })
  @ApiResponse({ status: 202, description: 'Geração iniciada.' })
  start(@Param('bookId') bookId: string): { started: boolean } {
    void this.runInBackground(bookId);

    return { started: true };
  }

  private async runInBackground(bookId: string): Promise<void> {
    try {
      await this.summaries.summarizeBook(bookId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha no backfill de resumos: bookId=${bookId}, motivo=${reason}`,
      );
    }
  }
}
