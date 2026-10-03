import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { validateEnv } from './env.validation.js';
import { entities } from './entities.js';
import { migrations } from '../migrations/index.js';

const env = validateEnv(process.env);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_SECRET,
  database: env.POSTGRES_DB_NAME,

  entities,
  migrations,

  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
};

export default new DataSource(dataSourceOptions);
