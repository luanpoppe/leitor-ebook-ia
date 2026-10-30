import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import { z } from 'zod';
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
// Resumo do capítulo + um resumo por parte; o raciocínio conta no teto.
const SUMMARY_MAX_TOKENS = 4_000;
const SUMMARY_TEMPERATURE = 0.2;
// A lib devolve esta frase quando o modelo não produziu conteúdo.
const EMPTY_RESPONSE_MARKER = 'Empty response from the model';
// Partes do capítulo: ~12 mil caracteres cada, no máximo 16 por capítulo.
// É a granularidade do "resumo do que já foi lido".
const MAX_PARTS = 16;
const TARGET_PART_CHARS = 12_000;
const PART_BOUNDARY_MIN_RATIO = 0.5;

const chapterSummarySchema = z.object({
  summary: z.string().trim().min(20).max(4_000),
  parts: z
    .array(
      z.object({
        index: z.number().int().min(1).max(MAX_PARTS),
        summary: z.string().trim().min(5).max(1_200),
      }),
    )
    .max(MAX_PARTS + 4),
});

interface ChapterToSummarize {
  id: string;
  position: number;
  title: string | null;
  text: string;
}

interface ChapterPart {
  position: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

interface PartSection {
  part: ChapterPart;
  summary: string;
}

export interface ChapterSummaryOutcome {
  summarized: number;
  failed: number;
}

/**
 * Gera o resumo de cada capítulo e um resumo por parte do capítulo, durante a
 * ingestão. O chat usa o resumo do capítulo para escolher o que consultar e os
 * resumos das partes já lidas para entender onde o leitor está.
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
      this.logger.warn(`Resumos ignorados (IA desativada): bookId=${bookId}.`);
      return { summarized: 0, failed: 0 };
    }

    // Capítulo com resumo mas sem partes (livro antigo) também entra: é o
    // backfill que cria as partes que faltam.
    const chapters = await this.prisma.chapter.findMany({
      where: {
        bookId,
        OR: [{ summary: null }, { sections: { none: {} } }],
      },
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

    const parts = splitIntoParts(chapter.text);

    try {
      const { response } = await this.client.callStructuredOutput({
        aiModel: SUMMARY_MODEL,
        outputSchema: chapterSummarySchema,
        systemPrompt: this.buildSystemPrompt(),
        messages: [
          AIMessages.human(this.buildUserPrompt(chapter, parts)),
        ],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: SUMMARY_MAX_TOKENS,
          temperature: SUMMARY_TEMPERATURE,
        },
        aiModelsFallback: [SUMMARY_FALLBACK_MODEL],
      });

      const summary = response.summary.trim();
      if (summary.length === 0) {
        this.logger.warn(
          `Resumo vazio no capítulo ${chapter.position}; mantido sem resumo.`,
        );
        return false;
      }

      const sections = this.resolveSections(response.parts, parts);
      await this.saveSummary(chapter.id, summary, sections);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Resumo estruturado falhou no capítulo ${chapter.position} (${reason}); tentando só o resumo do capítulo.`,
      );

      return this.summarizeWithoutSections(chapter);
    }
  }

  /** Fallback sem partes: o chat perde o resumo da parte lida, não o do capítulo. */
  private async summarizeWithoutSections(
    chapter: ChapterToSummarize,
  ): Promise<boolean> {
    if (this.client === null) return false;

    try {
      const response = await this.client.call({
        aiModel: SUMMARY_MODEL,
        systemPrompt: [
          'Você resume capítulos de livros para um assistente de leitura.',
          'Responda em português do Brasil, em 4 a 6 frases (no máximo 1.200 caracteres).',
          'Diga o que acontece, quem aparece e quais ideias ou temas o capítulo apresenta.',
          'Termine o resumo com a última cena do capítulo (como ele acaba), mesmo que seja um detalhe de atmosfera.',
          'Não opine, não cite outros capítulos e não comece com "Neste capítulo".',
        ].join('\n'),
        messages: [
          AIMessages.human(
            `${this.chapterLabel(chapter)}\n\n${this.toFallbackInput(chapter.text)}`,
          ),
        ],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: 2_000,
          temperature: SUMMARY_TEMPERATURE,
        },
        aiModelsFallback: [SUMMARY_FALLBACK_MODEL],
      });

      const summary = response.text.trim();
      const isEmpty =
        summary.length === 0 || summary === EMPTY_RESPONSE_MARKER;
      if (isEmpty) return false;

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

  private async saveSummary(
    chapterId: string,
    summary: string,
    sections: PartSection[],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.chapter.update({
        where: { id: chapterId },
        data: { summary },
      });
      await transaction.chapterSection.deleteMany({
        where: { chapterId },
      });

      if (sections.length === 0) return;

      await transaction.chapterSection.createMany({
        data: sections.map((section, index) => ({
          chapterId,
          position: index + 1,
          startOffset: section.part.startOffset,
          endOffset: section.part.endOffset,
          summary: section.summary,
        })),
      });
    });
  }

  private resolveSections(
    rawParts: Array<{ index: number; summary: string }>,
    parts: ChapterPart[],
  ): PartSection[] {
    const sections: PartSection[] = [];

    for (const rawPart of rawParts) {
      const part = parts[rawPart.index - 1];
      const summary = rawPart.summary.trim();
      if (part === undefined || summary.length === 0) continue;

      sections.push({ part, summary });
    }

    return sections;
  }

  private buildSystemPrompt(): string {
    return [
      'Você resume capítulos de livros para um assistente de leitura.',
      'Responda em português do Brasil.',
      'Devolva:',
      '- summary: o capítulo inteiro em 4 a 6 frases (no máximo 1.200 caracteres), terminando com a última cena do capítulo.',
      '- parts: para cada [PARTE n] do texto, um resumo de 2 a 3 frases (no máximo 350 caracteres), na ordem, sem repetir o resumo geral.',
      'Não opine e não comece com "Neste capítulo".',
    ].join('\n');
  }

  private buildUserPrompt(
    chapter: ChapterToSummarize,
    parts: ChapterPart[],
  ): string {
    const partsText = parts
      .map((part) => `[PARTE ${part.position}]\n${part.text}`)
      .join('\n\n');

    return `${this.chapterLabel(chapter)}\n\n${partsText}`;
  }

  private chapterLabel(chapter: ChapterToSummarize): string {
    if (chapter.title) {
      return `Capítulo ${chapter.position} — ${chapter.title}`;
    }

    return `Capítulo ${chapter.position}`;
  }

  private toFallbackInput(text: string): string {
    const maxChars = 150_000;
    if (text.length <= maxChars) return text;

    const head = text.slice(0, 100_000);
    const tail = text.slice(text.length - 50_000);

    return `${head}\n\n[…trecho do meio omitido…]\n\n${tail}`;
  }
}

/**
 * Divide o capítulo em partes de ~12 mil caracteres, cortando em fim de
 * parágrafo quando possível. O offset é o do texto do capítulo (0-based).
 */
export function splitIntoParts(text: string): ChapterPart[] {
  const targetSize = Math.max(
    TARGET_PART_CHARS,
    Math.ceil(text.length / MAX_PARTS),
  );
  const parts: ChapterPart[] = [];
  let start = 0;

  while (start < text.length) {
    const maxEnd = Math.min(text.length, start + targetSize);
    let end = maxEnd;

    if (maxEnd < text.length) {
      const boundary = text.lastIndexOf('\n\n', maxEnd);
      const isBoundaryUsable =
        boundary > start + targetSize * PART_BOUNDARY_MIN_RATIO;
      if (isBoundaryUsable) end = boundary + 2;
    }

    // Partes minúsculas por causa de muitos parágrafos não podem travar o loop.
    if (end <= start) end = maxEnd;

    parts.push({
      position: parts.length + 1,
      startOffset: start,
      endOffset: end,
      text: text.slice(start, end),
    });
    start = end;
  }

  return parts;
}
