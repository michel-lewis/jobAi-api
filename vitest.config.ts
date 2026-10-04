import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Les tests d'intégration ont leur propre config : ils sont lents.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int-spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Seul le code applicatif compte. Mesurer la couverture d'un fichier
      // de config ou d'une migration ne dit rien d'utile.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.int-spec.ts',
        'src/migrations/**',
        'src/config/**',
        'src/main.ts',
        'src/**/*.module.ts',
        // Les entités sont des déclarations de schéma, pas de la logique.
        // La base et les migrations les vérifient, pas un test unitaire.
        'src/**/entities/**',
      ],
    },
  },
});
