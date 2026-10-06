import type { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';
import type { Env } from './env.validation.js';

/**
 * Factory partagée par chaque module qui a besoin de signer ou vérifier un
 * JWT. `auth` et `profiles` sont tous les deux couche 1 — ils ne s'importent
 * pas l'un l'autre — donc chacun enregistre son propre `JwtModule`. Passer
 * par cette fonction unique évite que les deux enregistrements dérivent
 * (secret ou expiration différents d'un module à l'autre).
 */
export function jwtModuleOptions(
  config: ConfigService<Env, true>,
): JwtModuleOptions {
  return {
    secret: config.get('JWT_SECRET', { infer: true }),
    signOptions: {
      expiresIn: config.get('JWT_EXPIRATION', { infer: true }),
    },
  };
}
