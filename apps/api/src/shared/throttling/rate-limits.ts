/**
 * Cuántas peticiones por minuto se aceptan de una misma IP.
 *
 * Esto **no** es el bloqueo por intentos fallidos (ese cuenta credenciales equivocadas y vive en
 * el dominio): es un tope de caudal, para que nadie pueda inundar la API. Por eso se mide por IP
 * y no por cuenta: cuando llega la petición todavía no se sabe de quién es.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Un uso normal de la web no se acerca; un bucle descontrolado, sí. */
export const DEFAULT_RATE_LIMIT = 120;

/** Más estricto en `/auth`: ahí cada petición cuesta un argon2id de 19 MiB. */
export const AUTH_RATE_LIMIT = 20;

/** Lee un tope del entorno. Un valor que no sea un entero positivo se ignora. */
export function rateLimitFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Si la ruta es de autenticación, que lleva el tope estricto. */
export function isAuthPath(url: string | undefined, apiPrefix: string): boolean {
  const path = (url ?? '').split('?')[0] ?? '';

  return path === `/${apiPrefix}/auth` || path.startsWith(`/${apiPrefix}/auth/`);
}

/** Los health checks no llevan tope: los consulta Docker cada pocos segundos. */
export function isHealthPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0] ?? '';

  return path === '/health' || path.startsWith('/health/');
}
