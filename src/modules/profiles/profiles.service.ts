import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In } from 'typeorm';
import { Profile } from './entities/profile.entity.js';
import { ProfileExperience } from './entities/profile-experience.entity.js';
import { ExperienceBullet } from './entities/experience-bullet.entity.js';
import { ProfileEducation } from './entities/profile-education.entity.js';
import { ProfileSkill } from './entities/profile-skill.entity.js';
import { ProfileLanguage } from './entities/profile-language.entity.js';
import { ProfileCertification } from './entities/profile-certification.entity.js';
import { ProfileLink } from './entities/profile-link.entity.js';
import type { PutProfileDto } from './dto/put-profile.dto.js';
import type { ProfileDto } from './dto/profile.dto.js';

export interface VersionedProfile {
  dto: ProfileDto;
  version: number;
}

function scalarFields(dto: PutProfileDto) {
  return {
    fullName: dto.fullName,
    headline: dto.headline,
    summary: dto.summary,
    email: dto.email,
    phone: dto.phone,
    location: dto.location,
    willingToRelocate: dto.willingToRelocate,
    workPreference: dto.workPreference,
    workAuthorizationNote: dto.workAuthorizationNote,
    rawCvText: dto.rawCvText,
  };
}

@Injectable()
export class ProfilesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Lu dans une transaction REPEATABLE READ : les 7 requêtes qui composent
   * le document (le profil + ses 6 collections d'enfants) voient toutes le
   * même instantané. Sans ça, un PUT concurrent entre deux de ces requêtes
   * pourrait renvoyer un mélange — la version du profil d'avant son écriture
   * avec les expériences d'après, par exemple.
   *
   * Pas de 404 : un profil existe pour tout utilisateur inscrit, créé dans
   * la même transaction que lui (voir createForUser). Si `findOneOrFail`
   * échoue malgré tout, c'est que cet invariant a été rompu ailleurs — une
   * erreur 500 journalisée, pas une réponse qu'un client pourrait légitimement
   * recevoir.
   */
  async findMine(userId: string): Promise<VersionedProfile> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const profile = await manager.findOneOrFail(Profile, {
        where: { userId },
      });

      return {
        dto: await this.assembleDto(manager, profile),
        version: profile.version,
      };
    });
  }

  /**
   * Appelée par AuthService, dans la transaction qui crée l'utilisateur —
   * jamais directement par une route. Un profil existe dès l'inscription ;
   * PUT /profiles/me ne fait plus que le remplacer, jamais le créer.
   */
  async createForUser(
    manager: EntityManager,
    userId: string,
    fullName: string,
  ): Promise<void> {
    await manager.save(
      Profile,
      manager.create(Profile, {
        userId,
        fullName,
        version: 1,
        headline: null,
        summary: null,
        email: null,
        phone: null,
        location: null,
        willingToRelocate: false,
        workPreference: null,
        workAuthorizationNote: null,
        rawCvText: null,
      }),
    );
  }

  /**
   * UPDATE conditionnel en une seule requête : la ligne n'est modifiée QUE
   * si sa version correspond encore à celle que le client a lue. `affected
   * !== 1` est toujours une version périmée — un profil existe pour tout
   * utilisateur inscrit, donc il n'y a plus de cas ambigu « n'existe pas ».
   *
   * Le document de réponse est construit AVANT le commit, avec le même
   * manager que l'écriture : sinon, une relecture après coup pourrait
   * tomber après qu'un autre PUT se soit glissé entre le commit et elle,
   * et renvoyer un ETag qui ne décrit plus ce que le corps contient.
   */
  async replace(
    userId: string,
    ifMatch: number,
    dto: PutProfileDto,
  ): Promise<VersionedProfile> {
    return this.dataSource.transaction((manager) =>
      this.updateProfile(manager, userId, ifMatch, dto),
    );
  }

  private async updateProfile(
    manager: EntityManager,
    userId: string,
    ifMatch: number,
    dto: PutProfileDto,
  ): Promise<VersionedProfile> {
    const result = await manager
      .createQueryBuilder()
      .update(Profile)
      .set({ ...scalarFields(dto), version: () => '"version" + 1' })
      .where('"user_id" = :userId AND "version" = :ifMatch', {
        userId,
        ifMatch,
      })
      .returning(['id', 'version'])
      .execute();

    if (result.affected !== 1) {
      throw new ConflictException({
        code: 'PROFILE_VERSION_MISMATCH',
        message:
          'Le profil a changé depuis ta dernière lecture — relis-le (GET) puis réessaie',
      });
    }

    const row = result.raw[0] as { id: string; version: number };

    // Les enfants sont entièrement recréés. Les puces (experience_bullets)
    // ne sont PAS supprimées ici : elles disparaissent via le ON DELETE
    // CASCADE déclenché par la suppression de leur expérience parente.
    await manager.delete(ProfileExperience, { profileId: row.id });
    await manager.delete(ProfileEducation, { profileId: row.id });
    await manager.delete(ProfileSkill, { profileId: row.id });
    await manager.delete(ProfileLanguage, { profileId: row.id });
    await manager.delete(ProfileCertification, { profileId: row.id });
    await manager.delete(ProfileLink, { profileId: row.id });

    await this.insertChildren(manager, row.id, dto);

    const profile = await manager.findOneOrFail(Profile, {
      where: { id: row.id },
    });

    return {
      dto: await this.assembleDto(manager, profile),
      version: row.version,
    };
  }

  private async insertChildren(
    manager: EntityManager,
    profileId: string,
    dto: PutProfileDto,
  ): Promise<void> {
    const experienceRows = dto.experiences.map((experience, index) => ({
      profileId,
      company: experience.company,
      title: experience.title,
      employmentType: experience.employmentType,
      location: experience.location,
      startDate: experience.startDate,
      endDate: experience.endDate,
      summary: experience.summary,
      sortOrder: index,
    }));
    const savedExperiences = experienceRows.length
      ? await manager.save(ProfileExperience, experienceRows)
      : [];

    const bulletRows = dto.experiences.flatMap((experience, experienceIndex) =>
      experience.bullets.map((text, bulletIndex) => ({
        experienceId: savedExperiences[experienceIndex].id,
        text,
        sortOrder: bulletIndex,
      })),
    );
    if (bulletRows.length) {
      await manager.save(ExperienceBullet, bulletRows);
    }

    if (dto.education.length) {
      await manager.save(
        ProfileEducation,
        dto.education.map((education, index) => ({
          profileId,
          ...education,
          sortOrder: index,
        })),
      );
    }

    if (dto.skills.length) {
      await manager.save(
        ProfileSkill,
        dto.skills.map((skill, index) => ({
          profileId,
          ...skill,
          sortOrder: index,
        })),
      );
    }

    if (dto.languages.length) {
      await manager.save(
        ProfileLanguage,
        dto.languages.map((language, index) => ({
          profileId,
          ...language,
          sortOrder: index,
        })),
      );
    }

    if (dto.certifications.length) {
      await manager.save(
        ProfileCertification,
        dto.certifications.map((certification, index) => ({
          profileId,
          ...certification,
          sortOrder: index,
        })),
      );
    }

    if (dto.links.length) {
      await manager.save(
        ProfileLink,
        dto.links.map((link, index) => ({
          profileId,
          ...link,
          sortOrder: index,
        })),
      );
    }
  }

  private async assembleDto(
    manager: EntityManager,
    profile: Profile,
  ): Promise<ProfileDto> {
    const profileId = profile.id;
    const order = { sortOrder: 'ASC' as const };

    // Séquentiel, pas Promise.all : `manager` tient une seule connexion
    // dédiée (on est dans une transaction) — y lancer plusieurs requêtes en
    // parallèle revient à les envoyer sur le même client pg en même temps.
    // node-postgres les mettait en file, mais déclare cet usage déprécié.
    const experiences = await manager.find(ProfileExperience, {
      where: { profileId },
      order,
    });
    const education = await manager.find(ProfileEducation, {
      where: { profileId },
      order,
    });
    const skills = await manager.find(ProfileSkill, {
      where: { profileId },
      order,
    });
    const languages = await manager.find(ProfileLanguage, {
      where: { profileId },
      order,
    });
    const certifications = await manager.find(ProfileCertification, {
      where: { profileId },
      order,
    });
    const links = await manager.find(ProfileLink, {
      where: { profileId },
      order,
    });

    const bullets = experiences.length
      ? await manager.find(ExperienceBullet, {
          where: {
            experienceId: In(experiences.map((experience) => experience.id)),
          },
          order,
        })
      : [];

    const bulletsByExperience = new Map<string, ExperienceBullet[]>();
    for (const bullet of bullets) {
      const list = bulletsByExperience.get(bullet.experienceId) ?? [];
      list.push(bullet);
      bulletsByExperience.set(bullet.experienceId, list);
    }

    return {
      id: profile.id,
      fullName: profile.fullName,
      headline: profile.headline,
      summary: profile.summary,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      willingToRelocate: profile.willingToRelocate,
      workPreference: profile.workPreference,
      workAuthorizationNote: profile.workAuthorizationNote,
      rawCvText: profile.rawCvText,
      experiences: experiences.map((experience) => ({
        company: experience.company,
        title: experience.title,
        employmentType: experience.employmentType,
        location: experience.location,
        startDate: experience.startDate,
        endDate: experience.endDate,
        summary: experience.summary,
        bullets: (bulletsByExperience.get(experience.id) ?? []).map(
          (bullet) => ({
            text: bullet.text,
          }),
        ),
      })),
      education: education.map((entry) => ({
        school: entry.school,
        degree: entry.degree,
        field: entry.field,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        credentialEvaluation: entry.credentialEvaluation,
        honours: entry.honours,
      })),
      skills: skills.map((skill) => ({
        name: skill.name,
        category: skill.category,
      })),
      languages: languages.map((language) => ({
        name: language.name,
        proficiency: language.proficiency,
      })),
      certifications: certifications.map((certification) => ({
        name: certification.name,
        issuer: certification.issuer,
        issuedOn: certification.issuedOn,
        expiresOn: certification.expiresOn,
        credentialUrl: certification.credentialUrl,
      })),
      links: links.map((link) => ({
        kind: link.kind,
        url: link.url,
        label: link.label,
      })),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
