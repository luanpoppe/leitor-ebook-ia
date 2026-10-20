import { Logger } from '@nestjs/common';
import { Client } from 'minio';
import { EnvService } from '../env.service';

/**
 * Token de injeção do client MinIO compartilhado.
 * `null` quando o endpoint ou as credenciais não estão configurados.
 */
export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

export type MinioClient = Client | null;

/**
 * Bucket usado quando `MINIO_BUCKET` está ausente ou vazio. Compartilhado com
 * o health check para que readiness e upload consultem o mesmo bucket.
 */
export const DEFAULT_MINIO_BUCKET = 'ebooks';

const logger = new Logger('MinioClient');

const DEFAULT_MINIO_PORT = 9000;

/**
 * Sem configurar, o SDK assume 64 MiB como limiar de multipart e bufferiza
 * em memória (`readAsBuffer`) todo arquivo menor que isso. Com o mínimo
 * aceito pelo S3 (5 MiB), arquivos acima desse tamanho já vão por
 * multipart/stream.
 */
const MINIO_PART_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Desmonta a URL de `MINIO_ENDPOINT` (ex.: `http://localhost:9000`) nas
 * opções esperadas pelo construtor do client MinIO.
 */
function buildClientOptions(
  endpoint: string,
  accessKey: string,
  secretKey: string,
): ConstructorParameters<typeof Client>[0] {
  const parsed = new URL(endpoint);
  const useSSL = parsed.protocol === 'https:';
  const port = parsed.port ? Number(parsed.port) : DEFAULT_MINIO_PORT;

  return {
    endPoint: parsed.hostname,
    port,
    useSSL,
    accessKey,
    secretKey,
    partSize: MINIO_PART_SIZE_BYTES,
  };
}

export const storageProvider = {
  provide: MINIO_CLIENT,
  inject: [EnvService],
  useFactory: (env: EnvService): MinioClient => {
    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY } =
      env.getEnvs();

    const isEndpointMissing = !MINIO_ENDPOINT;
    const isCredentialMissing = !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY;

    if (isEndpointMissing || isCredentialMissing) {
      logger.warn(
        'MinIO não configurado (MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY) — storage desabilitado.',
      );
      return null;
    }

    const options = buildClientOptions(
      MINIO_ENDPOINT,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
    );

    return new Client(options);
  },
};
