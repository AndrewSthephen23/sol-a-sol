import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Pruebas unitarias: sin base de datos ni red. */
export default defineConfig({
  // SWC emite la metadata de decoradores que necesita la inyección de dependencias de NestJS.
  plugins: [swc.vite({ module: { type: 'es6' } })],
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
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.fake.ts',
        'src/main.ts',
        'src/seed.ts',
        'src/generated/**',
      ],
    },
  },
});
