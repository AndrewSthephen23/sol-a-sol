/**
 * Desde qué orígenes se acepta una petición del navegador.
 *
 * Es una lista cerrada y **nunca `*`**: la sesión viaja en una cookie, y un `*` con credenciales
 * ni siquiera es válido. Sin la variable configurada queda solo la web en desarrollo, para que
 * olvidarla no signifique "cualquiera puede llamar desde cualquier página".
 */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

/** Cabeceras que el navegador puede mandar: las que la API usa de verdad, y ninguna más. */
export const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id'];

export const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

/** Lee los orígenes de `WEB_ORIGIN`, separados por comas. */
export function webOriginsFrom(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  return origins.length === 0 ? [DEFAULT_WEB_ORIGIN] : origins;
}
