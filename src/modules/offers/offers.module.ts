import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';
import { Offer } from './entities/offer.entity.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/**
 * COUCHE 2 — feuille pour l'instant : ce ticket n'utilise encore aucune des
 * dépendances que l'architecture autorise (`platforms`, `llm`, `profiles`).
 * `Offer` n'est jamais exportée : aucun autre module ne peut lire ou écrire
 * la table en contournant le filtre de visibilité d'`OffersService`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Offer]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
