import { validateEnv } from './env.validation.js';

const JWT_SECRET = 'a'.repeat(32);

describe('validateEnv', () => {
  it('accepte DATABASE_URL seul, sans les variables POSTGRES_*', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
    });

    expect(env.DATABASE_URL).toBe('postgres://user:pass@host:5432/db');
  });

  it('accepte les variables POSTGRES_* seules, sans DATABASE_URL', () => {
    const env = validateEnv({
      POSTGRES_USER: 'jobai',
      POSTGRES_SECRET: 'secret',
      POSTGRES_DB_NAME: 'jobai',
      JWT_SECRET,
      NODE_ENV: 'test',
    });

    expect(env.POSTGRES_USER).toBe('jobai');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('rejette une DATABASE_URL valide mais au mauvais protocole', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'http://host:5432/db',
        JWT_SECRET,
      }),
    ).toThrow(/postgres/);
  });

  it('rejette quand ni DATABASE_URL ni les POSTGRES_* complètes ne sont fournies', () => {
    expect(() =>
      validateEnv({
        POSTGRES_USER: 'jobai',
        // POSTGRES_SECRET et POSTGRES_DB_NAME manquent, et pas de DATABASE_URL.
        JWT_SECRET,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('exige ANTHROPIC_API_KEY hors environnement de test', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://user:pass@host:5432/db',
        JWT_SECRET,
        NODE_ENV: 'production',
        // Pas de ANTHROPIC_API_KEY.
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("n'exige pas ANTHROPIC_API_KEY en environnement de test", () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
    });

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
