import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIEmbeddings, type AIEmbeddingModelNames } from '@luanpoppe/ai';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';
import { EMBEDDING_DIMENSIONS } from '../core/ai/embedding.constants';
import { EnvService } from '../core/env.service';
import { EmbeddingUnavailableError } from './indexing.errors';

/**
 * Configuração de comportamento do modelo de embedding — hardcoded de
 * propósito, não é variável de ambiente.
 * O prefixo `openrouter/` é exigido pelo SDK para rotear a chamada via
 * OpenRouter com `openRouterApiKey`.
 */
export const EMBEDDING_MODEL: AIEmbeddingModelNames =
  'openrouter/openai/text-embedding-3-small';
export const EMBEDDING_BATCH_SIZE = 64;

const EMBEDDINGS_DISABLED_MESSAGE =
  'Embeddings desativados: OPENROUTER_API_KEY não configurada.';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(AI_CLIENT) private readonly client: AiClient,
    private readonly env: EnvService,
  ) {}

  /**
   * Divide os textos em lotes do tamanho informado, preservando a ordem.
   * Lista vazia devolve lista vazia (nenhum lote).
   */
  static batchTexts(
    texts: string[],
    size = EMBEDDING_BATCH_SIZE,
  ): string[][] {
    if (texts.length === 0) return [];

    const batches: string[][] = [];
    for (let start = 0; start < texts.length; start += size) {
      batches.push(texts.slice(start, start + size));
    }

    return batches;
  }

  /**
   * Gera os vetores de um único lote (até `EMBEDDING_BATCH_SIZE` textos).
   * Público para o chamador gravar lote a lote, sem perder o que já foi pago
   * quando um lote posterior falha.
   */
  async embedBatch(batch: string[]): Promise<number[][]> {
    if (batch.length === 0) return [];

    const openRouterApiKey = this.requireOpenRouterApiKey();
    let batchVectors: number[][];

    try {
      batchVectors = await AIEmbeddings.embedDocuments(
        batch,
        {
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        { openRouterApiKey },
      );
    } catch (error) {
      const normalizedError = this.toError(error);
      this.logger.error(
        `Falha ao gerar embeddings de um lote: ${normalizedError.message}`,
        normalizedError.stack,
      );

      throw new EmbeddingUnavailableError(
        normalizedError.message,
        normalizedError,
      );
    }

    const hasConsistentCount = batchVectors.length === batch.length;
    if (!hasConsistentCount) {
      const message = `Resposta inconsistente da API de embeddings: ${batchVectors.length} vetor(es) para ${batch.length} texto(s).`;
      this.logger.error(message);

      throw new EmbeddingUnavailableError(message);
    }

    return batchVectors;
  }

  /**
   * Vetoriza uma pergunta para a busca por similaridade. Usa `embedQuery`
   * (task de consulta), não `embedDocuments`, porque a pergunta não é um
   * documento do índice.
   */
  async embedQuery(text: string): Promise<number[]> {
    const openRouterApiKey = this.requireOpenRouterApiKey();

    try {
      return await AIEmbeddings.embedQuery(
        text,
        {
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        { openRouterApiKey },
      );
    } catch (error) {
      const normalizedError = this.toError(error);
      this.logger.error(
        `Falha ao gerar o vetor da consulta: ${normalizedError.message}`,
        normalizedError.stack,
      );

      throw new EmbeddingUnavailableError(
        normalizedError.message,
        normalizedError,
      );
    }
  }

  private requireOpenRouterApiKey(): string {
    if (!this.client) {
      throw new EmbeddingUnavailableError(EMBEDDINGS_DISABLED_MESSAGE);
    }

    const { OPENROUTER_API_KEY } = this.env.getEnvs();
    if (!OPENROUTER_API_KEY) {
      throw new EmbeddingUnavailableError(EMBEDDINGS_DISABLED_MESSAGE);
    }

    return OPENROUTER_API_KEY;
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
