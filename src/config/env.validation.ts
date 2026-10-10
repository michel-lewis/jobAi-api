import { z } from 'zod';

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
    LLM_DAILY_QUOTA_PER_USER: z.coerce.number().int().positive().default(20),
    LLM_RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(500),
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
  });

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
