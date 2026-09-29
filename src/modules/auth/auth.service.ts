import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity.js';
import type { RegisterDto, RegisteredUserDto } from './dto/register.dto.js';

/** Code d'erreur PostgreSQL pour une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async register(dto: RegisterDto): Promise<RegisteredUserDto> {
    // Pré-vérification : sert uniquement à produire un message clair.
    // Ce n'est PAS la garantie d'unicité — voir le catch plus bas.
    const existing = await this.users.findOne({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Cet email est déjà utilisé',
      });
    }

    const user = this.users.create({
      email: dto.email,
      passwordHash: await argon2.hash(dto.password),
      name: dto.name ?? null,
    });

    try {
      const saved = await this.users.save(user);
      return this.toDto(saved);
    } catch (error) {
      // Deux inscriptions simultanées passent toutes deux la pré-vérification.
      // La contrainte UNIQUE en base est la seule garantie réelle : on traduit
      // sa violation en 409 plutôt que de laisser remonter un 500.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'Cet email est déjà utilisé',
        });
      }
      throw error;
    }
  }

  /** Le hash ne sort jamais du service. */
  private toDto(user: User): RegisteredUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
