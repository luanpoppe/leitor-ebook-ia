import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import { z } from 'zod';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';

/**
 * Planejador de busca do chat — configuração de produto, hardcoded de
 * propósito. Mesmo modelo barato do chat: a saída é pequena e o custo por
 * pergunta é desprezível.
 */
const PLANNER_MODEL: AIModelNames = 'openrouter/deepseek/deepseek-v4.1-flash';
const PLANNER_FALLBACK_MODEL: AIModelNames =
  'openrouter/deepseek/deepseek-v4.1-flash';
const PLANNER_MAX_TOKENS = 1_000;
const PLANNER_TEMPERATURE = 0.2;
const MAX_QUERIES = 3;
const MAX_PLANNED_CHAPTERS = 2;
const CHAPTER_SUMMARY_PREVIEW_CHARS = 280;
const SELECTION_PREVIEW_CHARS = 600;

const chatPlanSchema = z.object({
  queries: z
    .array(z.string().trim().min(2).max(180))
    .min(1)
    .max(MAX_QUERIES),
  chapters: z
    .array(z.number().int().min(1).max(100_000))
    .max(MAX_PLANNED_CHAPTERS)
    .default([]),
  wantsImage: z.boolean().default(false),
  imageSubject: z.string().trim().max(300).default(''),
});

export type ChatPlan = z.infer<typeof chatPlanSchema>;

export interface PlannerChapter {
  position: number;
  title: string | null;
  summary: string;
}

export interface PlannerInput {
  question: string;
  bookTitle: string;
  chapters: PlannerChapter[];
  scope: 'up-to-current' | 'whole-book';
  /** Capítulo em que o leitor está (limite do escopo "até aqui"). */
  position: number;
  /** Trecho selecionado: a pergunta é sobre ele. */
  selection?: string;
}

/**
 * Transforma a pergunta do leitor em termos de busca e capítulos cujos resumos
 * ajudam. Falha do planejador não derruba o chat: cai na pergunta original.
 */
@Injectable()
export class ChatQueryPlanner {
  private readonly logger = new Logger(ChatQueryPlanner.name);

  constructor(@Inject(AI_CLIENT) private readonly client: AiClient) {}

  async plan(input: PlannerInput): Promise<ChatPlan> {
    const fallback: ChatPlan = {
      queries: [input.question],
      chapters: [],
      wantsImage: false,
      imageSubject: '',
    };
    if (this.client === null) return fallback;

    try {
      const { response } = await this.client.callStructuredOutput({
        aiModel: PLANNER_MODEL,
        outputSchema: chatPlanSchema,
        systemPrompt: this.buildSystemPrompt(input),
        messages: [AIMessages.human(this.buildUserPrompt(input))],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: PLANNER_MAX_TOKENS,
          temperature: PLANNER_TEMPERATURE,
        },
        aiModelsFallback: [PLANNER_FALLBACK_MODEL],
      });

      return this.sanitizePlan(response, input);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Planejador falhou; usando a pergunta como busca: ${reason}`,
      );
      return fallback;
    }
  }

  private buildSystemPrompt(input: PlannerInput): string {
    const lines = [
      `Você planeja a busca de um chat sobre o livro "${input.bookTitle}".`,
      'Dada a pergunta do leitor, devolva:',
      `- queries: 1 a ${MAX_QUERIES} consultas curtas de busca (3 a 10 palavras), em português, variando sinônimos e nomes próprios quando ajudar. Não repita a pergunta inteira.`,
      `- chapters: até ${MAX_PLANNED_CHAPTERS} números de capítulos cujos resumos ajudam a responder, usando apenas os capítulos listados.`,
      'Escolha pelo menos 1 capítulo quando a pergunta for sobre o conteúdo do livro; deixe vazio só quando a pergunta for apenas sobre a página atual.',
      'Para perguntas sobre o livro inteiro (enredo, final, temas, personagens), escolha os capítulos que melhor cobrem o arco — inclusive o último capítulo narrativo quando a pergunta for sobre o desfecho.',
      'Não se preocupe com spoilers: o leitor escolheu consultar o livro todo.',
      'wantsImage: true somente se o leitor estiver pedindo para gerar, desenhar ou criar uma imagem.',
      'imageSubject: quando wantsImage for true, o que a imagem deve retratar (personagem, lugar ou cena) em poucas palavras; senão devolva string vazia.',
    ];
    if (input.selection !== undefined) {
      lines.push(
        'A pergunta é sobre o trecho selecionado pelo leitor: use os nomes e termos dele nas buscas.',
      );
    }
    if (input.scope === 'up-to-current') {
      lines.push(
        `O leitor está no capítulo ${input.position}: escolha apenas capítulos anteriores a ele.`,
        'O resumo do capítulo atual não é enviado porque o leitor pode não ter chegado ao fim dele.',
      );
    }

    return lines.join('\n');
  }

  private buildUserPrompt(input: PlannerInput): string {
    const hasChapters = input.chapters.length > 0;
    const chapterLines = input.chapters.map((chapter) => {
      const title = chapter.title ?? `Capítulo ${chapter.position}`;
      const preview = this.preview(chapter.summary);
      const summary = preview.length > 0 ? preview : '(sem resumo)';

      return `- Capítulo ${chapter.position} — ${title}: ${summary}`;
    });
    const chaptersBlock = hasChapters
      ? chapterLines.join('\n')
      : '(não há resumos disponíveis; devolva chapters vazio)';
    const lines = [
      'Capítulos disponíveis:',
      chaptersBlock,
      '',
    ];
    if (input.selection !== undefined) {
      lines.push(
        `Trecho selecionado pelo leitor: "${this.preview(input.selection, SELECTION_PREVIEW_CHARS)}"`,
        '',
      );
    }
    lines.push(`Pergunta do leitor: ${input.question}`);

    return lines.join('\n');
  }

  private preview(summary: string, maxChars = CHAPTER_SUMMARY_PREVIEW_CHARS): string {
    const singleLine = summary.replace(/\s+/g, ' ').trim();
    const isLong = singleLine.length > maxChars;
    if (!isLong) return singleLine;

    return `${singleLine.slice(0, maxChars).trimEnd()}…`;
  }

  private sanitizePlan(plan: ChatPlan, input: PlannerInput): ChatPlan {
    const queries: string[] = [];
    for (const query of plan.queries) {
      const trimmedQuery = query.trim();
      const isDuplicate = queries.some(
        (existing) =>
          existing.toLocaleLowerCase('pt-BR') ===
          trimmedQuery.toLocaleLowerCase('pt-BR'),
      );
      if (trimmedQuery.length === 0 || isDuplicate) continue;

      queries.push(trimmedQuery);
    }
    if (queries.length === 0) queries.push(input.question);

    const allowedChapters = new Set(
      input.chapters
        .filter(
          (chapter) =>
            input.scope === 'whole-book' ||
            chapter.position <= input.position,
        )
        .map((chapter) => chapter.position),
    );
    const chapters: number[] = [];
    for (const position of plan.chapters) {
      const isAllowed = allowedChapters.has(position);
      const isDuplicate = chapters.includes(position);
      if (!isAllowed || isDuplicate) continue;

      chapters.push(position);
    }

    return {
      queries: queries.slice(0, MAX_QUERIES),
      chapters: chapters.slice(0, MAX_PLANNED_CHAPTERS),
      wantsImage: plan.wantsImage,
      imageSubject: plan.wantsImage ? plan.imageSubject.trim() : '',
    };
  }
}
