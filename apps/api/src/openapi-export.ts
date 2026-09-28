import { writeFileSync } from 'node:fs';

import { appVersion } from './shared/openapi/app-version.js';
import { buildOpenApiDocument } from './shared/openapi/openapi.js';

/**
 * `pnpm api:client`, primer paso: escribe en `dist/openapi.json` el documento OpenAPI **con todos
 * los módulos encendidos**, del que la web genera sus tipos.
 *
 * No arranca Nest ni toca la base: arma el documento con la misma función que sirve
 * `/api/v1/openapi.json`, así que la web recibe exactamente lo que la API describe. Con los flags
 * del entorno faltarían justo los módulos en construcción, que son los que la web necesita para
 * prepararse antes de encenderlos.
 */
const document = buildOpenApiDocument({ version: appVersion(), isFeatureEnabled: () => true });

writeFileSync(new URL('openapi.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
