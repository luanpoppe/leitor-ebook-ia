import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { EnvService } from '../env.service';

/**
 * Token de injeção da conexão Redis compartilhada.
 * `null` quando `REDIS_URL` não está configurada.
 */
export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export type RedisConnection = Redis | null;

const logger = new Logger('RedisConnection');

/**
 * Opções recomendadas pelo BullMQ para conexões ioredis.
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ; `enableReadyCheck`
 * desligado evita log de "ready check failed" em conexões bloqueantes.
 */
const BULLMQ_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const redisConnectionProvider = {
  provide: REDIS_CONNECTION,
  inject: [EnvService],
  useFactory: (env: EnvService): RedisConnection => {
    const { REDIS_URL } = env.getEnvs();

    if (!REDIS_URL) {
      logger.warn(
        'REDIS_URL não configurada — módulo de filas operará sem conexão Redis.',
      );
      return null;
    }

    const connection = new Redis(REDIS_URL, BULLMQ_REDIS_OPTIONS);

    // Redis fora no boot não pode derrubar a aplicação: o ioredis reconecta
    // sozinho, então apenas registramos o aviso.
    connection.on('error', (error: Error) => {
      logger.warn(`Erro na conexão Redis: ${error.message}`);
    });

    return connection;
  },
};
