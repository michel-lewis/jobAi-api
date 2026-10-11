import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { ApplicationGenerationStore } from './generation-store.js';
import { Application } from './entities/application.entity.js';
import { OffersModule } from '../offers/offers.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/**
 * COUCHE 3 — orchestrateur. Dépend de `offers` et `documents` (couche 2),
 * jamais l'inverse. N'exporte que `ApplicationsService` ; `Application` et
 * `ApplicationGenerationStore` restent internes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Application]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
    OffersModule,
    DocumentsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationGenerationStore],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
