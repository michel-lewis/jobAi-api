import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

/**
 * Couverture GLOBALE : la suite unitaire et la suite d'intégration dans une
 * seule exécution, donc un seul rapport.
 *
 * Sans ça on obtient deux rapports partiels, et une ligne couverte par les
 * tests HTTP apparaît comme un trou dans le rapport unitaire. C'est la façon
 * la plus courante de se tromper sur un chiffre de couverture.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['**/*.spec.ts', '**/*.int-spec.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      hookTimeout: 180_000,
      testTimeout: 60_000,
      fileParallelism: false,
    },
  }),
);
