import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { testDataSourceOptions, truncateAllTables } from './database.js';

export interface TestDatabase {
  /** Source de données connectée au Postgres jetable. */
  dataSource: DataSource;
  /** Vide toutes les tables sans redémarrer le conteneur. */
  truncateAll(): Promise<void>;
  /** Ferme la connexion puis détruit le conteneur. */
  stop(): Promise<void>;
}

/**
 * Un Postgres réel dans un conteneur jetable, migrations appliquées.
 *
 * Pour les tests qui n'ont pas besoin de l'application : contraintes,
 * migrations, comportement réel des requêtes.
 *
 * Un conteneur par fichier de test, pas par test — le démarrage coûte
 * quelques secondes. L'isolation entre tests passe par `truncateAll()`.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();

  const dataSource = new DataSource(testDataSourceOptions(container));
  await dataSource.initialize();

  return {
    dataSource,

    truncateAll() {
      return truncateAllTables(dataSource);
    },

    async stop() {
      await dataSource.destroy();
      await container.stop();
    },
  };
}
