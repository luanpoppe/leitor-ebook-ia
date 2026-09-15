import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  controllers: [AppController],
})
export class AppModule {}
