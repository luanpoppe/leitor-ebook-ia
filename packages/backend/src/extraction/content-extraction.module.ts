import { Module } from '@nestjs/common';
import { FileStorageModule } from '../storage/file-storage.module';
import { ContentExtractor } from './content-extractor';
import { EpubParser } from './epub-parser';
import { PdfParser } from './pdf-parser';
import { TxtParser } from './txt-parser';

@Module({
  imports: [FileStorageModule],
  providers: [EpubParser, PdfParser, TxtParser, ContentExtractor],
  exports: [ContentExtractor],
})
export class ContentExtractionModule {}
