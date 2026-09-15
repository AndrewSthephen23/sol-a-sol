import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Pruebas de integración: PostgreSQL real en un contenedor efímero (Testcontainers). */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globalSetup: ['./test/setup/postgres.global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
