import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from '../../src/config/entities.js';
import { migrations } from '../../src/migrations/index.js';

/**
 * La configuration de base de données partagée par les deux harnais.
 *
 * Elle était dupliquée : l'un pour une source de données seule, l'autre pour
 * l'application complète. Deux copies d'une config dérivent, et le jour où
 * elles diffèrent, une suite teste un schéma que l'autre ne connaît pas.
 *
 * `synchronize: false` + `migrationsRun: true` : le schéma est construit par
 * les migrations du projet, pas déduit des entités. C'est toute la valeur du
 * test d'intégration — il s'exécute contre le schéma que la production aura.
 */
export function testDataSourceOptions(
  container: StartedPostgreSqlContainer,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities,
    migrations,
    migrationsRun: true,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    logging: ['error'],
  };
}

/**
 * Vide toutes les tables sans redémarrer le conteneur.
 *
 * Une seule commande : CASCADE règle l'ordre des clés étrangères,
 * RESTART IDENTITY remet les séquences à zéro.
 */
export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas
    .map((meta) => `"${meta.tableName}"`)
    .join(', ');

  await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
