import { Logger } from '@nestjs/common';
import { Client } from 'minio';
import { EnvService } from '../env.service';

/**
 * Token de injeção do client MinIO compartilhado.
 * `null` quando o endpoint ou as credenciais não estão configurados.
 */
export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

export type MinioClient = Client | null;

const logger = new Logger('MinioClient');

const DEFAULT_MINIO_PORT = 9000;

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
