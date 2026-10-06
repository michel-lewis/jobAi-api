import 'dotenv/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/config/env.validation.js';
import { testDataSourceOptions, truncateAllTables } from './database.js';
import { AuthModule } from '../../src/modules/auth/auth.module.js';
import { ProfilesModule } from '../../src/modules/profiles/profiles.module.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';

export interface TestApp {
  /** À passer à request() de Supertest. */
  server: Server;
  app: INestApplication;
  dataSource: DataSource;
  truncateAll(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Démarre l'application complète sur un Postgres jetable.
 *
 * On recompose les modules au lieu d'importer AppModule : AppModule câble
 * TypeORM sur la base de développement, qu'il faudrait ensuite remplacer.
 * Ici la base du conteneur est branchée dès la construction.
 *
 * Les gardes et pipes réels sont en place — le ThrottlerGuard compris, sinon
 * un test de limitation de débit ne testerait rien.
 */
export async function startTestApp(): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      TypeOrmModule.forRoot(testDataSourceOptions(container)),
      AuthModule,
      ProfilesModule,
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const dataSource = app.get(DataSource);
  return {
    server: app.getHttpServer() as Server,
    app,
    dataSource,

    truncateAll() {
      return truncateAllTables(dataSource);
    },

    async stop() {
      await app.close();
      await container.stop();
    },
  };
}
