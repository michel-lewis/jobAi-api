import { InitialSchema1790664971345 } from './1790664971345-InitialSchema.js';

/**
 * Migrations déclarées explicitement, dans l'ordre. Le glob
 * `migrations/*.{ts,js}` fonctionne sous le CLI mais pas de façon fiable
 * depuis Vitest en ESM : le harnais de test a besoin d'une liste importable.
 *
 * Contrepartie : chaque nouvelle migration s'ajoute ici à la main. C'est le
 * même compromis que pour les entités, et il est assumé.
 */
export const migrations = [InitialSchema1790664971345];
