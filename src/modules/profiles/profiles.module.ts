import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { Profile } from './entities/profile.entity.js';
import { ProfileExperience } from './entities/profile-experience.entity.js';
import { ExperienceBullet } from './entities/experience-bullet.entity.js';
import { ProfileEducation } from './entities/profile-education.entity.js';
import { ProfileSkill } from './entities/profile-skill.entity.js';
import { ProfileLanguage } from './entities/profile-language.entity.js';
import { ProfileCertification } from './entities/profile-certification.entity.js';
import { ProfileLink } from './entities/profile-link.entity.js';
import { jwtModuleOptions } from '../../config/jwt.config.js';

/** COUCHE 1 — feuille. N'importe aucun autre module métier. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      ProfileExperience,
      ExperienceBullet,
      ProfileEducation,
      ProfileSkill,
      ProfileLanguage,
      ProfileCertification,
      ProfileLink,
    ]),
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
