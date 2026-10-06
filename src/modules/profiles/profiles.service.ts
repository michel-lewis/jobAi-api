import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Profile } from './entities/profile.entity.js';
import type { CreateProfileDto, ProfileDto } from './dto/create-profile.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

/** Code d'erreur PostgreSQL pour une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profiles: Repository<Profile>,
  ) {}

  async create(userId: string, dto: CreateProfileDto): Promise<ProfileDto> {
    // Pré-vérification : sert uniquement à produire un message clair.
    // Ce n'est PAS la garantie d'unicité — voir le catch plus bas.
    const existing = await this.profiles.findOne({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message: 'Un profil existe déjà pour cet utilisateur',
      });
    }

    const profile = this.profiles.create({
      userId,
      professionalInformation: dto.professionalInformation,
      personalInformation: dto.personalInformation,
      education: dto.education,
      location: dto.location ?? null,
    });

    try {
      const saved = await this.profiles.save(profile);
      return this.toDto(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException({
          code: 'PROFILE_EXISTS',
          message: 'Un profil existe déjà pour cet utilisateur',
        });
      }
      throw error;
    }
  }

  async findMine(userId: string): Promise<ProfileDto> {
    const profile = await this.profiles.findOne({ where: { userId } });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: "Aucun profil n'existe pour cet utilisateur",
      });
    }

    return this.toDto(profile);
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const profile = await this.profiles.findOne({ where: { userId } });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: "Aucun profil n'existe pour cet utilisateur",
      });
    }

    Object.assign(profile, dto);
    const saved = await this.profiles.save(profile);
    return this.toDto(saved);
  }

  private toDto(profile: Profile): ProfileDto {
    return {
      id: profile.id,
      professionalInformation: profile.professionalInformation,
      personalInformation: profile.personalInformation,
      education: profile.education,
      location: profile.location,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
