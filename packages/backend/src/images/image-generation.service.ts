import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../core/env.service';

/**
 * Modelo de imagem — configuração de produto, hardcoded de propósito.
 * Gemini 2.5 Flash Image: ~US$ 0,039 por imagem no OpenRouter.
 */
const IMAGE_MODEL = 'google/gemini-2.5-flash-image';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 120_000;

export interface GeneratedImageFile {
  buffer: Buffer;
  contentType: string;
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      images?: Array<{ image_url?: { url?: string } }>;
    };
  }>;
  error?: { message?: string };
}

export class ImageGenerationError extends Error {
  constructor(message = 'Não foi possível gerar a imagem agora.') {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

/**
 * Chama o endpoint de chat do OpenRouter com modalidade imagem. A lib de IA do
 * projeto cobre chat/embeddings, não geração de imagem, então esta é a única
 * chamada HTTP direta ao provedor.
 */
@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(private readonly env: EnvService) {}

  get model(): string {
    return IMAGE_MODEL;
  }

  async generate(prompt: string): Promise<GeneratedImageFile> {
    const apiKey = this.env.getEnvs().OPENROUTER_API_KEY;
    if (!apiKey) throw new ImageGenerationError('OPENROUTER_API_KEY ausente.');

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['image', 'text'],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha de rede ao gerar imagem: ${reason}`);
      throw new ImageGenerationError();
    }

    const payload = (await response.json()) as OpenRouterImageResponse;
    if (!response.ok) {
      this.logger.error(
        `Provedor recusou a imagem (${response.status}): ${payload.error?.message ?? 'sem detalhe'}`,
      );
      throw new ImageGenerationError();
    }

    const imageUrl = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const isDataUrl = imageUrl?.startsWith('data:') ?? false;
    if (!imageUrl || !isDataUrl) {
      this.logger.error(
        `Resposta sem imagem. Prévia: ${JSON.stringify(payload).slice(0, 600)}`,
      );
      throw new ImageGenerationError();
    }

    return this.decodeDataUrl(imageUrl);
  }

  private decodeDataUrl(dataUrl: string): GeneratedImageFile {
    const separatorIndex = dataUrl.indexOf(',');
    if (separatorIndex < 0) throw new ImageGenerationError();

    const metadata = dataUrl.slice(0, separatorIndex);
    const base64 = dataUrl.slice(separatorIndex + 1);
    const contentType =
      metadata.match(/^data:([^;]+);base64$/)?.[1] ?? 'image/png';

    return { buffer: Buffer.from(base64, 'base64'), contentType };
  }
}
