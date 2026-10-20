import { Module } from '@nestjs/common';
import { EbookRepository } from './ebook.repository';

@Module({
  providers: [EbookRepository],
  exports: [EbookRepository],
})
export class CatalogModule {}
