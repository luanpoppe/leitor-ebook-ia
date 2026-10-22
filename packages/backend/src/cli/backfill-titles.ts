import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BackfillTitlesModule } from './backfill-titles.module';
import { BackfillTitlesService } from './backfill-titles.service';

const logger = new Logger('BackfillTitles');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BackfillTitlesModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const service = app.get(BackfillTitlesService);
    await service.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Backfill de títulos abortado: ${message}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
