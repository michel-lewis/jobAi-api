import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/** COUCHE 1 — feuille. N'importe aucun autre module métier. */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
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
