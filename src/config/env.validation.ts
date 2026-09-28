import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  POSTGRES_USER: z.string(),
  POSTGRES_SECRET: z.string(),
  POSTGRES_DB_NAME: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_HOST: z.string().default('localhost'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const errorMessages = result.error.issues.map((err) => err.message);
    throw new Error(
      `Environment validation error:\n${errorMessages.join('\n')}`,
    );
  }

  return result.data;
}
