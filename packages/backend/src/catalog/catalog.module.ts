import { Module } from '@nestjs/common';
import { EbookContentRepository } from './ebook-content.repository';
import { EbookRepository } from './ebook.repository';

@Module({
  providers: [EbookRepository, EbookContentRepository],
  exports: [EbookRepository, EbookContentRepository],
})
export class CatalogModule {}
