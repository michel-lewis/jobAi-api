import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { Profile } from './entities/profile.entity.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/** COUCHE 1 — feuille. N'importe aucun autre module métier. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Profile]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
