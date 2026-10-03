import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import type { Env } from '../../config/env.validation.js';

/** COUCHE 1 — feuille. N'importe aucun autre module métier. */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // registerAsync + inject : le secret vient de la config VALIDÉE.
    // register({ secret: process.env.X }) lirait l'env brut et contournerait Zod.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRATION', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
