import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './schema.gen';

/** Cliente tipado de la API: rutas, cuerpos y respuestas salen de su documento OpenAPI. */
export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** Origen de la API, sin el prefijo `/api/v1`, que ya viene en cada ruta del documento. */
  baseUrl: string;
  /** Para las pruebas; si falta, el `fetch` global. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Los tipos (`schema.gen.ts`) los genera `pnpm api:client` desde la API y **no se editan**: si
 * hace falta tocarlos a mano, el que está mal es el contrato. CI falla si quedaron desactualizados.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  // Sin `fetch`, `openapi-fetch` usa el global.
  return createClient<paths>(options);
}
