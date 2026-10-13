import { Global, Module } from '@nestjs/common';
import {
  REDIS_CONNECTION,
  redisConnectionProvider,
} from './redis-connection.provider';

@Global()
@Module({
  providers: [redisConnectionProvider],
  exports: [REDIS_CONNECTION],
})
export class QueueModule {}
