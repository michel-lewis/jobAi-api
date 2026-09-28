import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { validateEnv } from './env.validation.js';
import { User } from '../modules/auth/entities/user.entity.js';
import { Profile } from '../modules/profiles/entities/profile.entity.js';
import { Application } from '../modules/applications/entities/application.entity.js';
import { GeneratedDocument } from '../modules/documents/entities/generated-document.entity.js';
import { Offer } from '../modules/offers/entities/offer.entity.js';

const env = validateEnv(process.env);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_SECRET,
  database: env.POSTGRES_DB_NAME,

  entities: [User, Profile, Application, GeneratedDocument, Offer], // à remplir au ticket JOBAI-3
  migrations: [`${import.meta.dirname}/../migrations/*.{ts,js}`],

  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
};

export default new DataSource(dataSourceOptions);
