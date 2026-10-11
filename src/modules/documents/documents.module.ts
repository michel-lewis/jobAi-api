import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service.js';
import { GeneratedDocument } from './entities/generated-document.entity.js';
import { LlmModule } from '../llm/llm.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';

/**
 * COUCHE 2 — dépend de `llm` et `profiles` (couche 1), aucun autre module
 * métier. N'exporte que `DocumentsService` : `GeneratedDocument` et son
 * repository restent internes, comme toutes les entités du projet.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GeneratedDocument]),
    LlmModule,
    ProfilesModule,
  ],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
