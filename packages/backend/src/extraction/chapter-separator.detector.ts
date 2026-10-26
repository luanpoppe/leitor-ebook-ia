import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import { z } from 'zod';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';

/**
 * Detector de separador de capítulos — configuração de produto, hardcoded de
 * propósito. Só roda quando a divisão padrão parece ter falhado.
 */
const DETECTOR_MODEL: AIModelNames = 'openrouter/deepseek/deepseek-v4.1-flash';
const DETECTOR_FALLBACK_MODEL: AIModelNames =
  'openrouter/deepseek/deepseek-v4.1-flash';
const DETECTOR_MAX_TOKENS = 1_200;
const DETECTOR_TEMPERATURE = 0.1;
// Trecho do meio: onde a chance de ter vários inícios de capítulo é maior. Com
// capítulos de 5–20 mil caracteres, 30 mil pega pelo menos dois começos.
const SAMPLE_SIZE = 30_000;
const MAX_PATTERN_LENGTH = 120;
const MAX_HEADING_LENGTH = 100;
const MIN_SAMPLE_MATCHES = 2;
const MAX_SAMPLE_MATCHES = 40;

const separatorSchema = z.object({
  pattern: z.string().trim().min(3).max(MAX_PATTERN_LENGTH),
  explanation: z.string().trim().max(300).optional(),
});

export interface DetectedSeparator {
  pattern: string;
  regex: RegExp;
}

/**
 * Quando o padrão de capítulos do código não reconhece o livro, manda um trecho
 * do meio para o modelo identificar como os capítulos começam. A resposta é um
 * regex ancorado no início da linha, validado contra o próprio trecho antes de
 * ser usado — padrão inválido ou que casa demais é descartado.
 */
@Injectable()
export class ChapterSeparatorDetector {
  private readonly logger = new Logger(ChapterSeparatorDetector.name);

  constructor(@Inject(AI_CLIENT) private readonly client: AiClient) {}

  async detect(fullText: string): Promise<DetectedSeparator | null> {
    if (this.client === null) return null;

    const sample = this.sampleMiddle(fullText);
    if (sample.length === 0) return null;

    try {
      const { response } = await this.client.callStructuredOutput({
        aiModel: DETECTOR_MODEL,
        outputSchema: separatorSchema,
        systemPrompt: this.buildSystemPrompt(),
        messages: [AIMessages.human(sample)],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: DETECTOR_MAX_TOKENS,
          temperature: DETECTOR_TEMPERATURE,
        },
        aiModelsFallback: [DETECTOR_FALLBACK_MODEL],
      });

      return this.validate(response.pattern, sample);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Detector de separador falhou: ${reason}`);
      return null;
    }
  }

  private buildSystemPrompt(): string {
    return [
      'Você identifica como os capítulos começam em trechos de livros.',
      'Receba um trecho do meio do livro e devolva um padrão (regex JavaScript) que reconheça APENAS as linhas que iniciam capítulo.',
      'Regras do padrão:',
      '- comece com ^ (ancorado no início da linha);',
      '- aceite variações numéricas (use \\d+), ignorando maiúsculas/minúsculas;',
      '- não use lookarounds, grupos aninhados com repetição nem .* no meio;',
      '- exemplos válidos: ^CAPÍTULO \\d+, ^Chapter \\d+, ^\\d+\\. , ^PARTE \\d+.',
      'Se o trecho não tiver início de capítulo reconhecível, devolva um padrão que não case com nada (ex.: ^$).',
      'Explique em uma frase curta o que o padrão reconhece.',
    ].join('\n');
  }

  private sampleMiddle(text: string): string {
    if (text.length <= SAMPLE_SIZE) return text;

    const start = Math.floor((text.length - SAMPLE_SIZE) / 2);
    return text.slice(start, start + SAMPLE_SIZE);
  }

  private validate(pattern: string, sample: string): DetectedSeparator | null {
    const normalizedPattern = pattern.trim();
    this.logger.log(`Padrão sugerido pela IA: ${normalizedPattern}`);
    if (!normalizedPattern.startsWith('^')) {
      this.logger.warn('Padrão descartado: não está ancorado no início.');
      return null;
    }
    if (this.hasUnsafeQuantifiers(normalizedPattern)) {
      this.logger.warn('Padrão descartado: quantificador inseguro.');
      return null;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(normalizedPattern, 'i');
    } catch {
      this.logger.warn('Padrão descartado: regex inválido.');
      return null;
    }

    const lines = sample
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const matches = new Set(
      lines.filter(
        (line) =>
          line.length <= MAX_HEADING_LENGTH && regex.test(line),
      ),
    );

    const hasTooFewMatches = matches.size < MIN_SAMPLE_MATCHES;
    const hasTooManyMatches = matches.size > MAX_SAMPLE_MATCHES;
    if (hasTooFewMatches || hasTooManyMatches) {
      this.logger.warn(
        `Padrão descartado: ${matches.size} ocorrências na amostra.`,
      );
      return null;
    }

    this.logger.log(
      `Separador detectado: ${normalizedPattern} (${matches.size} ocorrências na amostra).`,
    );

    return { pattern: normalizedPattern, regex };
  }

  /** Evita padrões com repetição aninhada, que podem travar em texto longo. */
  private hasUnsafeQuantifiers(pattern: string): boolean {
    const repeatedAny = /(\.\*|\.\+)[*+]/.test(pattern);
    const nestedGroup = /\([^)]*[+*][^)]*\)[+*]/.test(pattern);

    return repeatedAny || nestedGroup;
  }
}
