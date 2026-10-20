import type { Readable } from 'node:stream';
import { ContentExtractionError } from './content.types';

/**
 * Leitura de stream com teto de bytes. Arquivos enviados pelo usuário não têm
 * tamanho confiável, então o acumulado é conferido a cada chunk.
 */
export class StreamUtils {
  static async readToBuffer(
    stream: Readable,
    maxBytes: number,
    limitMessage: string,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of stream) {
      const chunkValue: unknown = chunk;
      const chunkBuffer = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue as Uint8Array);
      totalBytes += chunkBuffer.length;

      if (totalBytes > maxBytes) {
        stream.destroy();
        throw new ContentExtractionError(limitMessage);
      }

      chunks.push(chunkBuffer);
    }

    return Buffer.concat(chunks);
  }
}
