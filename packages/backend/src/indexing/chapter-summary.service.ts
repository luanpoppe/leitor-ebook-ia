import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';
import { PrismaService } from '../core/prisma.service';

/**
 * Modelo dos resumos — configuração de produto, hardcoded de propósito.
 * É o mesmo modelo barato do chat (US$ 0,02/M de entrada, contexto de 1M).
 */
const SUMMARY_MODEL: AIModelNames = 'openrouter/deepseek/deepseek-v4.1-flash';
const SUMMARY_FALLBACK_MODEL: AIModelNames =
  'openrouter/deepseek/deepseek-v4.1-flash';
const SUMMARY_CONCURRENCY = 3;
// O raciocínio do modelo conta no teto de saída: com pouco token ele devolve
// vazio. O teto é folgado porque só se paga o que for gerado.
const SUMMARY_MAX_TOKENS = 2_000;
const SUMMARY_TEMPERATURE = 0.2;
// A lib devolve esta frase quando o modelo não produziu conteúdo.
const EMPTY_RESPONSE_MARKER = 'Empty response from the model';
// Capítulo gigante (PDF sem headings) é cortado no meio para caber no contexto:
// começo e fim, que é onde costuma estar o que interessa para um resumo.
const MAX_SUMMARY_INPUT_CHARS = 150_000;
const SUMMARY_HEAD_CHARS = 100_000;
const SUMMARY_TAIL_CHARS = 50_000;

interface ChapterToSummarize {
  id: string;
  position: number;
  title: string | null;
  text: string;
}

export interface ChapterSummaryOutcome {
  summarized: number;
  failed: number;
}

/**
 * Gera o resumo de cada capítulo durante a ingestão, em background. O resumo é
 * usado pelo chat para o modelo escolher quais capítulos consultar sem pagar o
 * texto inteiro no prompt.
 */
@Injectable()
export class ChapterSummaryService {
  private readonly logger = new Logger(ChapterSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_CLIENT) private readonly client: AiClient,
  ) {}

  async summarizeBook(bookId: string): Promise<ChapterSummaryOutcome> {
    if (this.client === null) {
      this.logger.warn(
        `Resumos ignorados (IA desativada): bookId=${bookId}.`,
      );
      return { summarized: 0, failed: 0 };
    }

    const chapters = await this.prisma.chapter.findMany({
      where: { bookId, summary: null },
      orderBy: { position: 'asc' },
      select: { id: true, position: true, title: true, text: true },
    });
    if (chapters.length === 0) return { summarized: 0, failed: 0 };

    const startedAt = Date.now();
    let summarized = 0;
    let failed = 0;

    // Em lotes: paraleliza o suficiente para ser rápido, sem estourar o rate
    // limit do provedor em livros com dezenas de capítulos.
    for (let index = 0; index < chapters.length; index += SUMMARY_CONCURRENCY) {
      const batch = chapters.slice(index, index + SUMMARY_CONCURRENCY);
      const results = await Promise.all(
        batch.map((chapter) => this.summarizeChapter(chapter)),
      );

      for (const wasSummarized of results) {
        if (wasSummarized) summarized += 1;
        else failed += 1;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Resumos gerados: bookId=${bookId}, ${summarized} capítulo(s), ${failed} falha(s), ${elapsedMs}ms.`,
    );

    return { summarized, failed };
  }

  private async summarizeChapter(
    chapter: ChapterToSummarize,
  ): Promise<boolean> {
    if (this.client === null) return false;

    const systemPrompt = [
      'Você resume capítulos de livros para um assistente de leitura.',
      'Responda em português do Brasil, em 4 a 6 frases (no máximo 1.200 caracteres).',
      'Diga o que acontece, quem aparece e quais ideias ou temas o capítulo apresenta.',
      'Termine o resumo com a última cena do capítulo (como ele acaba), mesmo que seja um detalhe de atmosfera.',
      'Não opine, não cite outros capítulos e não comece com "Neste capítulo".',
    ].join('\n');
    const chapterLabel = chapter.title
      ? `Capítulo ${chapter.position} — ${chapter.title}`
      : `Capítulo ${chapter.position}`;
    const userPrompt = [
      chapterLabel,
      '',
      this.toSummaryInput(chapter.text),
    ].join('\n');

    try {
      const response = await this.client.call({
        aiModel: SUMMARY_MODEL,
        systemPrompt,
        messages: [AIMessages.human(userPrompt)],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: SUMMARY_MAX_TOKENS,
          temperature: SUMMARY_TEMPERATURE,
        },
        aiModelsFallback: [SUMMARY_FALLBACK_MODEL],
      });
      const summary = response.text.trim();
      const isEmpty =
        summary.length === 0 || summary === EMPTY_RESPONSE_MARKER;
      if (isEmpty) {
        this.logger.warn(
          `Resumo vazio no capítulo ${chapter.position}; mantido sem resumo.`,
        );
        return false;
      }

      await this.prisma.chapter.update({
        where: { id: chapter.id },
        data: { summary },
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha ao resumir o capítulo ${chapter.position}: ${reason}`,
      );
      return false;
    }
  }

  private toSummaryInput(text: string): string {
    const isTooLong = text.length > MAX_SUMMARY_INPUT_CHARS;
    if (!isTooLong) return text;

    const head = text.slice(0, SUMMARY_HEAD_CHARS);
    const tail = text.slice(text.length - SUMMARY_TAIL_CHARS);

    return `${head}\n\n[…trecho do meio omitido…]\n\n${tail}`;
  }
}
