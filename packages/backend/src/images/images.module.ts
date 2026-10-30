import { Module } from '@nestjs/common';
import { FileStorageModule } from '../storage/file-storage.module';
import { ImageGenerationService } from './image-generation.service';
import { ImageRepository } from './image.repository';
import { ImageService } from './image.service';
import { ImagesController } from './images.controller';

@Module({
  imports: [FileStorageModule],
  controllers: [ImagesController],
  providers: [ImageGenerationService, ImageRepository, ImageService],
  exports: [ImageService],
})
export class ImagesModule {}
