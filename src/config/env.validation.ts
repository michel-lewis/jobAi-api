import { z } from 'zod';

/**
 * Nombre total d'appels à `generateText` par lettre, premier essai compris
 * (ADR-14, décision 3a) — une seule relance de format au plus. Constante de
 * code, pas une variable d'environnement : rien dans l'ADR n'en fait un
 * réglage d'exploitation.
 */
export const FORMAT_MAX_ATTEMPTS = 2;

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    // Render fournit une URL complète ; en local on garde les POSTGRES_*
    // séparées. L'une des deux doit suffire — jamais les deux obligatoires.
    // Le schéma est vérifié ici : une URL valide mais du mauvais protocole
    // (collée depuis le mauvais champ du dashboard Render, par exemple) ne
    // doit pas attendre la tentative de connexion pour être signalée.
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (url) =>
          url.startsWith('postgres://') || url.startsWith('postgresql://'),
        {
          message:
            'DATABASE_URL must use the postgres:// or postgresql:// scheme',
        },
      )
      .optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_SECRET: z.string().optional(),
    POSTGRES_DB_NAME: z.string().optional(),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_HOST: z.string().default('localhost'),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRATION: z.string().default('1h'),
    // Absente en environnement de test : LlmModule y branche un faux
    // déterministe qui n'appelle jamais le réseau, donc jamais la clé.
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().optional(),
    LLM_TOTAL_BUDGET_MS: z.coerce.number().int().positive().default(55_000),
    LLM_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
    // 40, pas 20 : FORMAT_MAX_ATTEMPTS (ADR-14, décision 3a) double la
    // consommation de quota par lettre dans le cas courant. La limite
    // promettait 20 lettres par jour à l'utilisateur, pas 20 appels LLM —
    // la laisser à 20 aurait fait chuter ce nombre à 10 sans qu'aucune
    // décision ne l'ait choisi.
    LLM_DAILY_QUOTA_PER_USER: z.coerce.number().int().positive().default(40),
    LLM_RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(500),
    // Un travail 'draft' plus vieux que ça (depuis generationStartedAt, pas
    // createdAt) est lu comme échoué par GET /applications/:id — ADR-13.
    // 150 000, pas 120 000 : FORMAT_MAX_ATTEMPTS (2) multiplie le temps LLM
    // pur consommé par lettre, pas seulement le quota (ADR-14, décision
    // 3a) — 40s de marge réelle au-delà du pire cas LLM pur
    // (2 x LLM_TOTAL_BUDGET_MS), assez pour le temps non-LLM.
    GENERATION_STALE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(150_000),
  })
  .refine(
    (env) =>
      Boolean(env.DATABASE_URL) ||
      Boolean(env.POSTGRES_USER && env.POSTGRES_SECRET && env.POSTGRES_DB_NAME),
    {
      message:
        'Either DATABASE_URL or POSTGRES_USER/POSTGRES_SECRET/POSTGRES_DB_NAME must be set',
    },
  )
  .refine((env) => env.NODE_ENV === 'test' || Boolean(env.ANTHROPIC_API_KEY), {
    message: 'ANTHROPIC_API_KEY must be set outside the test environment',
  })
  .refine(
    (env) =>
      env.GENERATION_STALE_TIMEOUT_MS >=
      FORMAT_MAX_ATTEMPTS * env.LLM_TOTAL_BUDGET_MS + 10_000,
    {
      message:
        'GENERATION_STALE_TIMEOUT_MS must stay well above ' +
        'FORMAT_MAX_ATTEMPTS * LLM_TOTAL_BUDGET_MS (at least 10s of margin) ' +
        '— otherwise a job still legitimately in flight gets marked failed ' +
        'while it is still running, and a later retry can be silently ' +
        'overwritten by that stale job finally completing (ADR-13, ADR-14)',
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    // Sans le chemin, le message ne dit pas QUELLE variable manque.
    const errorMessages = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      `Environment validation error:\n${errorMessages.join('\n')}`,
    );
  }

  return result.data;
}
