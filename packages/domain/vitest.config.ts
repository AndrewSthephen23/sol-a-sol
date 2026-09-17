import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // `lcov` lo consume SonarQube Cloud, que analiza desde la raíz del monorepo:
      // las rutas del reporte deben ser relativas a esa raíz, no al paquete.
      reporter: [
        'text',
        ['lcov', { projectRoot: fileURLToPath(new URL('../..', import.meta.url)) }],
      ],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      // Umbral del dominio (CONTRIBUTING.md): por debajo, `pnpm test` falla.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
