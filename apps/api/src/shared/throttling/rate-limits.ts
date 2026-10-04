import { SetMetadata } from '@nestjs/common';

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

/**
 * Lo que puede mandar un teléfono a `POST /captures` (decisión 15 de H7): un atajo o una macro
 * normales mandan unas pocas; una que se repite en bucle, cientos.
 */
export const CAPTURE_RATE_LIMIT = 30;

/** El cupo aparte de una ruta: el de `/auth` o el de las capturas. Sin marca, el general. */
export type RateLimitBucket = 'auth' | 'captures';

export const RATE_LIMIT_BUCKET = Symbol('rateLimitBucket');

/**
 * Marca un controller o una ruta como de las que llevan el tope estricto de `/auth`.
 *
 * Va como **metadata del controller** y no como una comprobación de la URL a propósito: un
 * `/health/%2e%2e/api/v1/auth/login` se parece a un health check mirando el texto, pero Express
 * lo resuelve como la ruta de login. Quien decide es el destino real de la petición, que es lo
 * único que no puede falsear quien llama.
 */
export const StrictRateLimit = () =>
  SetMetadata(RATE_LIMIT_BUCKET, 'auth' satisfies RateLimitBucket);

/** Marca una ruta como del cupo de las capturas, con la misma regla: por metadata, no por URL. */
export const CaptureRateLimit = () =>
  SetMetadata(RATE_LIMIT_BUCKET, 'captures' satisfies RateLimitBucket);

/** Lee un tope del entorno. Un valor que no sea un entero positivo se ignora. */
export function rateLimitFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
