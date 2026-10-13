import { Global, Module } from '@nestjs/common';
import { AI_CLIENT, aiProvider } from './ai.provider';

@Global()
@Module({
  providers: [aiProvider],
  exports: [AI_CLIENT],
})
export class AiModule {}
