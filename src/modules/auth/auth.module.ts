import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/**
 * COUCHE 1, avec une exception délibérée : `auth` importe `profiles` pour
 * que le profil se crée dans la même transaction que l'utilisateur, à
 * l'inscription (voir AuthService.register). `User` est lu via le
 * `DataSource` global, pas via `TypeOrmModule.forFeature` — plus besoin de
 * l'enregistrer ici.
 */
@Module({
  imports: [
    ProfilesModule,
    // registerAsync + inject : le secret vient de la config VALIDÉE.
    // register({ secret: process.env.X }) lirait l'env brut et contournerait Zod.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
