import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service.js';
import { GeneratedDocument } from './entities/generated-document.entity.js';
import { LlmModule } from '../llm/llm.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { MARKET_NORM_PROVIDER } from './market-norm.js';
import { FileMarketNormProvider } from './market-norms/file-market-norm-provider.js';

/**
 * COUCHE 2 — dépend de `llm` et `profiles` (couche 1), aucun autre module
 * métier. N'exporte que `DocumentsService` : `GeneratedDocument` et son
 * repository restent internes, comme toutes les entités du projet.
 *
 * `MARKET_NORM_PROVIDER` n'est pas exporté : rien hors de ce module n'a
 * besoin de résoudre une norme directement (ADR-14, décision 2).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GeneratedDocument]),
    LlmModule,
    ProfilesModule,
  ],
  providers: [
    DocumentsService,
    { provide: MARKET_NORM_PROVIDER, useClass: FileMarketNormProvider },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
