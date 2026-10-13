import { Global, Module } from '@nestjs/common';
import {
  REDIS_CONNECTION,
  RedisConnectionLifecycle,
  redisConnectionProvider,
} from './redis-connection.provider';

@Global()
@Module({
  providers: [redisConnectionProvider, RedisConnectionLifecycle],
  exports: [REDIS_CONNECTION],
})
export class QueueModule {}
