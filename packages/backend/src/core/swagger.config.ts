import { DocumentBuilder } from '@nestjs/swagger';

export function createSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('Documentação da API')
    .setVersion('1.0')
    .addTag('api')
    .build();
}
