import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity.js';
import type { RegisterDto, RegisteredUserDto } from './dto/register.dto.js';
import type { LoggedInUserDto, LoginDto } from './dto/login.dto.js';

/** Code d'erreur PostgreSQL pour une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Hash jetable, vérifié quand l'email est inconnu : sans lui, un email absent
 * répondrait en ~2 ms et un mot de passe faux en ~100 ms — un attaquant
 * chronomètre et énumère les comptes malgré le message identique.
 * Calculé une seule fois au chargement du module.
 */
const DUMMY_HASH: Promise<string> = argon2.hash(
  randomBytes(32).toString('hex'),
);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
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
      return this.toRegisteredDto(saved);
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

  async login(dto: LoginDto): Promise<LoggedInUserDto> {
    const user = await this.users.findOne({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        autoApplyEnabled: true,
        createdAt: true,
      },
    });

    // On vérifie TOUJOURS un hash, existant ou factice : même chemin, même coût.
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? (await DUMMY_HASH),
      dto.password,
    );

    // Email inconnu et mot de passe faux renvoient exactement la même réponse :
    // distinguer les deux dirait à un attaquant quels comptes existent.
    if (!user || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou mot de passe invalide',
      });
    }

    return {
      ...this.toRegisteredDto(user),
      autoApplyEnabled: user.autoApplyEnabled,
      token: await this.signAccessToken(user),
    };
  }

  /**
   * Un JWT est signé, pas chiffré : le payload est lisible par quiconque.
   * On n'y met donc que l'identifiant — rien de confidentiel, rien qui puisse
   * devenir périmé avant l'expiration.
   */
  private signAccessToken(user: User): Promise<string> {
    return this.jwt.signAsync({ sub: user.id });
  }

  /** Le hash ne sort jamais du service. */
  private toRegisteredDto(user: User): RegisteredUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
