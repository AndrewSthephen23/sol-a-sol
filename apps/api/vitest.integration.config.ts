import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Pruebas de integración: PostgreSQL real en un contenedor efímero (Testcontainers). */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    env: {
      // Las pruebas hacen muchas peticiones seguidas desde la misma IP y no van sobre el tope
      // de caudal: se deja alto para no rechazarlas. La prueba que sí lo comprueba fija el suyo
      // antes de levantar su aplicación.
      RATE_LIMIT_PER_MINUTE: '100000',
      AUTH_RATE_LIMIT_PER_MINUTE: '100000',
      // Los logs de las pruebas estorban; los errores de verdad siguen saliendo por el filtro.
      LOG_LEVEL: 'silent',
    },
    globalSetup: ['./test/setup/postgres.global-setup.ts'],
    // Todos los archivos comparten el mismo PostgreSQL, así que corren en serie: en paralelo,
    // una prueba que consulta el estado global de una tabla (por ejemplo, si existe algún
    // usuario) vería las filas que otro archivo acaba de crear.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Controllers y repositorios de Prisma se prueban aquí, contra PostgreSQL real, y no en las
    // unitarias. Sin esta cobertura, SonarQube Cloud los vería sin probar. Va en su propia
    // carpeta para no pisar la de las unitarias; Sonar suma los dos reportes.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/integration',
      reporter: [
        'text-summary',
        ['lcov', { projectRoot: fileURLToPath(new URL('../..', import.meta.url)) }],
      ],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.fake.ts', 'src/main.ts', 'src/generated/**'],
    },
  },
});
