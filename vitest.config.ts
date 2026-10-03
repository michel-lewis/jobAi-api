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
  },
});
