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

  it('rejette GENERATION_STALE_TIMEOUT_MS trop proche de LLM_TOTAL_BUDGET_MS', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://user:pass@host:5432/db',
        JWT_SECRET,
        NODE_ENV: 'test',
        LLM_TOTAL_BUDGET_MS: '55000',
        GENERATION_STALE_TIMEOUT_MS: '60000',
      }),
    ).toThrow(/GENERATION_STALE_TIMEOUT_MS/);
  });

  it('accepte GENERATION_STALE_TIMEOUT_MS avec assez de marge au-dessus de LLM_TOTAL_BUDGET_MS', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
      LLM_TOTAL_BUDGET_MS: '55000',
      GENERATION_STALE_TIMEOUT_MS: '120000',
    });

    expect(env.GENERATION_STALE_TIMEOUT_MS).toBe(120_000);
  });

  // Preuve 18 — ADR-14 décision 3a : FORMAT_MAX_ATTEMPTS double le coût par
  // lettre dans le cas courant, donc le plafond par défaut monte de 20 à 40
  // pour que 20 lettres par jour restent atteignables.
  it('LLM_DAILY_QUOTA_PER_USER vaut 40 par défaut', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
    });

    expect(env.LLM_DAILY_QUOTA_PER_USER).toBe(40);
  });

  // Preuve 19 — GENERATION_STALE_TIMEOUT_MS monte à 150 000 ms par défaut :
  // 40s de marge au-delà du pire cas LLM pur (2 x LLM_TOTAL_BUDGET_MS),
  // pour couvrir aussi le temps non-LLM (ADR-14, conséquences).
  it('GENERATION_STALE_TIMEOUT_MS vaut 150 000 ms par défaut', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
    });

    expect(env.GENERATION_STALE_TIMEOUT_MS).toBe(150_000);
  });

  // Preuve 19 — la contrainte vérifiée au démarrage doit désormais compter
  // FORMAT_MAX_ATTEMPTS (2) appels pleins à generateText, pas un seul :
  // une valeur qui satisfaisait l'ancienne règle (>= LLM_TOTAL_BUDGET_MS +
  // 10s = 65 000 ms) doit être rejetée sous la nouvelle (>= 2 x
  // LLM_TOTAL_BUDGET_MS + 10s = 120 000 ms).
  it('rejette GENERATION_STALE_TIMEOUT_MS qui ne couvre que LLM_TOTAL_BUDGET_MS une seule fois, alors que le format en consomme deux', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://user:pass@host:5432/db',
        JWT_SECRET,
        NODE_ENV: 'test',
        LLM_TOTAL_BUDGET_MS: '55000',
        GENERATION_STALE_TIMEOUT_MS: '65000',
      }),
    ).toThrow(/GENERATION_STALE_TIMEOUT_MS/);
  });

  // Preuve 19 — la valeur par défaut documentée par l'ADR-14 (150 000 ms
  // pour un budget LLM de 55 000 ms) doit satisfaire la règle renforcée.
  it('accepte GENERATION_STALE_TIMEOUT_MS avec assez de marge au-dessus de deux fois LLM_TOTAL_BUDGET_MS', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET,
      NODE_ENV: 'test',
      LLM_TOTAL_BUDGET_MS: '55000',
      GENERATION_STALE_TIMEOUT_MS: '150000',
    });

    expect(env.GENERATION_STALE_TIMEOUT_MS).toBe(150_000);
  });
});
