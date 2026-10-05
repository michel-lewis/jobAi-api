import { User } from '../../src/modules/auth/entities/user.entity.js';

/**
 * Fabrique un utilisateur complet et TYPÉ.
 *
 * Son intérêt n'est pas d'économiser des lignes : c'est que le type de retour
 * est `User`, donc `makeUser({ password: '...' })` ne compile pas. Trois fois
 * dans ce projet, un objet utilisateur écrit à la main portait un champ
 * inexistant — `password` au lieu de `passwordHash` — et le test passait au
 * vert en testant un autre chemin que celui annoncé.
 *
 * On ne corrige pas un bug qui revient : on supprime la façon de l'écrire.
 */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '3f1a9c2e-5b7d-4e8a-9c1f-2d6b8e4a7c05',
    email: 'user@example.com',
    passwordHash: '$argon2id$placeholder',
    name: 'Test User',
    autoApplyEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
