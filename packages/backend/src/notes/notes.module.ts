import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { NotesController } from './notes.controller';
import { NotesCatalogController } from './notes-catalog.controller';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

@Module({
  imports: [CatalogModule],
  controllers: [NotesController, NotesCatalogController],
  providers: [NotesService, NotesRepository],
  exports: [NotesService],
})
export class NotesModule {}
