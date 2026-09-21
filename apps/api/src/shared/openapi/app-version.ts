import { createRequire } from 'node:module';

/**
 * Versión del producto, leída del `package.json` de la API.
 *
 * No se usa `npm_package_version`: esa variable solo existe cuando algo se lanza con pnpm, y la
 * imagen de producción arranca con `node dist/main.js`, así que ahí valdría `undefined`.
 *
 * La ruta relativa funciona en los dos sitios porque `dist/` refleja la estructura de `src/`:
 * desde `src/shared/openapi/` sube a `apps/api/`, y desde `dist/shared/openapi/` sube a `/app`.
 */
const require = createRequire(import.meta.url);

export function appVersion(): string {
  const { version } = require('../../../package.json') as { version?: string };

  return version ?? '0.0.0';
}
