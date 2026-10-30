import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { DictionaryController } from './dictionary.controller';
import { DictionaryRepository } from './dictionary.repository';
import { DictionaryService } from './dictionary.service';

@Module({
  imports: [CatalogModule],
  controllers: [DictionaryController],
  providers: [DictionaryService, DictionaryRepository],
  exports: [DictionaryService],
})
export class DictionaryModule {}
