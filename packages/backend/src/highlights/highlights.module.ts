import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { HighlightsCatalogController } from './highlights-catalog.controller';
import { HighlightsController } from './highlights.controller';
import { HighlightsRepository } from './highlights.repository';
import { HighlightsService } from './highlights.service';

@Module({
  imports: [CatalogModule],
  controllers: [HighlightsController, HighlightsCatalogController],
  providers: [HighlightsService, HighlightsRepository],
  exports: [HighlightsService],
})
export class HighlightsModule {}
