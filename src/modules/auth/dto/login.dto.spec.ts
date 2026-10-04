import { loginSchema } from './login.dto.js';

/**
 * La normalisation de l'email vit dans le SCHÉMA, pas dans le service :
 * quand `AuthService.login` reçoit son DTO, le pipe Zod est déjà passé.
 * Tester cette responsabilité ailleurs qu'ici serait tester une couche
 * pour le travail d'une autre.
 */
describe('loginSchema', () => {
  it('normalise l email en minuscules et sans espaces', () => {
    const parsed = loginSchema.parse({
      email: '  LEWIS@Example.COM  ',
      password: 'peu importe',
    });

    expect(parsed.email).toBe('lewis@example.com');
  });

  it('accepte un mot de passe court — login constate, il n impose pas', () => {
    expect(() =>
      loginSchema.parse({ email: 'lewis@example.com', password: 'a' }),
    ).not.toThrow();
  });

  it('refuse un mot de passe vide', () => {
    expect(() =>
      loginSchema.parse({ email: 'lewis@example.com', password: '' }),
    ).toThrow();
  });
});
