import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Pruebas de integración: PostgreSQL real en un contenedor efímero (Testcontainers). */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globalSetup: ['./test/setup/postgres.global-setup.ts'],
    // Todos los archivos comparten el mismo PostgreSQL, así que corren en serie: en paralelo,
    // una prueba que consulta el estado global de una tabla (por ejemplo, si existe algún
    // usuario) vería las filas que otro archivo acaba de crear.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
