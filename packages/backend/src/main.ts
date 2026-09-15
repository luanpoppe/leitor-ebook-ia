import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { createSwaggerConfig } from './core/swagger.config';
import { EnvService } from './core/env.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting application...');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ZodValidationPipe());
  logger.log('ZodValidationPipe enabled');

  const config = createSwaggerConfig();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, cleanupOpenApiDoc(document));
  logger.log('Swagger enabled');

  app.enableCors();
  logger.log('CORS enabled');

  const envService = app.get(EnvService);
  const port = envService.getEnvs().PORT;
  await app.listen(port);
  logger.log(`Server is running on port ${port}`);
}
void bootstrap();
