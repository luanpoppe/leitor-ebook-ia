import { Logger } from '@nestjs/common';
import { AI, type AIModelNames } from '@luanpoppe/ai';
import { EnvService } from '../env.service';

/**
 * Token de injeção do cliente de IA compartilhado.
 * `null` quando `OPENROUTER_API_KEY` não está configurada.
 */
export const AI_CLIENT = Symbol('AI_CLIENT');

export type AiClient = AI | null;

const logger = new Logger('AiClient');

/**
 * Modelo padrão de fallback usado nas chamadas de IA.
 * Configuração de comportamento — hardcoded de propósito, não é variável de ambiente.
 * Formato exigido pelo SDK para OpenRouter: prefixo `openrouter/`.
 */
export const DEFAULT_AI_MODEL: AIModelNames =
  'openrouter/deepseek/deepseek-v4-flash';

export const aiProvider = {
  provide: AI_CLIENT,
  inject: [EnvService],
  useFactory: (env: EnvService): AiClient => {
    const { OPENROUTER_API_KEY } = env.getEnvs();

    if (!OPENROUTER_API_KEY) {
      logger.warn(
        'OPENROUTER_API_KEY não configurada — recursos de IA operarão desativados.',
      );
      return null;
    }

    return new AI({
      openRouterApiKey: OPENROUTER_API_KEY,
      aiModelsFallback: [DEFAULT_AI_MODEL],
    });
  },
};
