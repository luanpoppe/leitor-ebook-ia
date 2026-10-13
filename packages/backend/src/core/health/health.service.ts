import { Inject, Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../env.service';
import { PrismaService } from '../prisma.service';
import { REDIS_CONNECTION, type RedisConnection } from '../queue/redis-connection.provider';
import { MINIO_CLIENT, type MinioClient } from '../storage/storage.provider';

/**
 * Teto de tempo de cada sondagem. Configuração de comportamento (não é
 * segredo), por isso hardcoded: uma dependência fora do ar não pode prender
 * o endpoint de readiness indefinidamente.
 */
const HEALTH_CHECK_TIMEOUT_MS = 2000;

export type HealthCheck = 'ok' | 'error';

export interface ReadinessReport {
  status: HealthCheck;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    storage: HealthCheck;
  };
}

interface TimeoutGuard {
  promise: Promise<never>;
  cancel: () => void;
}

/**
 * Sondagens de saúde da aplicação.
 *
 * `liveness` apenas confirma que o processo está vivo — não toca em
 * dependências externas. `readiness` verifica banco, Redis e storage em
 * paralelo e nunca lança: uma dependência fora do ar vira `'error'` no
 * relatório, não uma exceção.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) private readonly redis: RedisConnection,
    @Inject(MINIO_CLIENT) private readonly minio: MinioClient,
    private readonly env: EnvService,
  ) {}

  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessReport> {
    const [database, redis, storage] = await Promise.all([
      this.runCheck('database', () => this.probeDatabase()),
      this.runCheck('redis', () => this.probeRedis()),
      this.runCheck('storage', () => this.probeStorage()),
    ]);

    const checks = { database, redis, storage };

    const isDatabaseHealthy = database === 'ok';
    const isRedisHealthy = redis === 'ok';
    const isStorageHealthy = storage === 'ok';
    const isHealthy = isDatabaseHealthy && isRedisHealthy && isStorageHealthy;

    const status: HealthCheck = isHealthy ? 'ok' : 'error';

    return { status, checks };
  }

  /**
   * Executa uma sondagem com timeout e converte qualquer falha em `'error'`,
   * registrando o motivo. É o único ponto que captura exceções das sondagens.
   */
  private async runCheck(
    name: string,
    probe: () => Promise<unknown>,
  ): Promise<HealthCheck> {
    const timeout = this.createTimeout(name);

    try {
      await Promise.race([probe(), timeout.promise]);
      return 'ok';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health check "${name}" falhou: ${message}`);
      return 'error';
    } finally {
      timeout.cancel();
    }
  }

  private createTimeout(name: string): TimeoutGuard {
    let timer: NodeJS.Timeout;

    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Health check "${name}" excedeu ${HEALTH_CHECK_TIMEOUT_MS}ms`,
          ),
        );
      }, HEALTH_CHECK_TIMEOUT_MS);
    });

    const cancel = (): void => clearTimeout(timer);

    return { promise, cancel };
  }

  private async probeDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async probeRedis(): Promise<void> {
    if (!this.redis) {
      throw new Error('Conexão Redis não configurada (REDIS_URL ausente)');
    }

    await this.redis.ping();
  }

  private async probeStorage(): Promise<void> {
    if (!this.minio) {
      throw new Error('Client MinIO não configurado');
    }

    const { MINIO_BUCKET } = this.env.getEnvs();

    if (MINIO_BUCKET) {
      await this.minio.bucketExists(MINIO_BUCKET);
      return;
    }

    // Sem bucket configurado, valida apenas a conectividade com o storage.
    await this.minio.listBuckets();
  }
}
