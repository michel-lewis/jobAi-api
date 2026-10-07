import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { validateEnv, type Env } from './env.validation.js';
import { entities } from './entities.js';
import { migrations } from '../migrations/index.js';

const env = validateEnv(process.env);

const shared = {
  entities,
  migrations,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: (env.NODE_ENV === 'development'
    ? ['query', 'error']
    : ['error']) as DataSourceOptions['logging'],
};

/**
 * `validateEnv` garantit déjà que DATABASE_URL ou les trois POSTGRES_* sont
 * présents — ce contrôle ne fait que le redire à TypeScript, pour éviter un
 * `!` sur chaque champ dans la branche du bas.
 */
function assertPostgresVars(e: Env): asserts e is Env & {
  POSTGRES_USER: string;
  POSTGRES_SECRET: string;
  POSTGRES_DB_NAME: string;
} {
  if (!e.POSTGRES_USER || !e.POSTGRES_SECRET || !e.POSTGRES_DB_NAME) {
    throw new Error(
      'Unreachable: validateEnv requires POSTGRES_* when DATABASE_URL is absent',
    );
  }
}

function buildDataSourceOptions(e: Env): DataSourceOptions {
  if (e.DATABASE_URL) {
    return { type: 'postgres', url: e.DATABASE_URL, ...shared };
  }

  assertPostgresVars(e);
  return {
    type: 'postgres',
    host: e.POSTGRES_HOST,
    port: e.POSTGRES_PORT,
    username: e.POSTGRES_USER,
    password: e.POSTGRES_SECRET,
    database: e.POSTGRES_DB_NAME,
    ...shared,
  };
}

export const dataSourceOptions: DataSourceOptions = buildDataSourceOptions(env);

export default new DataSource(dataSourceOptions);
