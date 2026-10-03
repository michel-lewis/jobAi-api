import { defineConfig } from 'vitest/config';

/**
 * Configuration séparée pour les tests d'intégration : ils démarrent un
 * conteneur Docker, donc ils sont lents. Les garder hors de `npm test` protège
 * la boucle de retour rapide, et le hook pre-push les laisse de côté. La CI,
 * elle, lancera les deux.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.int-spec.ts'],
    // Le premier lancement télécharge l'image postgres : prévoir large.
    hookTimeout: 180_000,
    testTimeout: 60_000,
    // Les conteneurs ne doivent pas se marcher dessus.
    fileParallelism: false,
  },
});
