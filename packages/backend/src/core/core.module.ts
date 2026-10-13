import { Global, Module } from '@nestjs/common';
import { EnvService } from './env.service';
import { PrismaModule } from './prisma.module';
import { QueueModule } from './queue/queue.module';
import { AiModule } from './ai/ai.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';

@Global()
@Module({
  imports: [PrismaModule, QueueModule, AiModule, StorageModule, HealthModule],
  providers: [EnvService],
  exports: [EnvService],
})
export class CoreModule { }
