import type { Clock } from '../time/clock.js';

/**
 * Cuánto vale un token de acceso: **15 minutos**.
 *
 * Corto a propósito. Es el token que viaja en cada petición, así que si se filtra, la ventana
 * para usarlo es pequeña; quien siga en la aplicación no nota nada porque el refresh (tarea 05)
 * emite uno nuevo sin pedir la contraseña.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenExpiry {
  issuedAt: Date;
  expiresAt: Date;
  /** Un JWT cuenta `iat` y `exp` en segundos enteros desde 1970, no en milisegundos. */
  issuedAtInSeconds: number;
  expiresAtInSeconds: number;
}

/**
 * Cuándo se emite y cuándo caduca un token, según el reloj que se le pase.
 *
 * El instante entra por el puerto `Clock` y no por `new Date()`: así una prueba puede fijarlo y
 * comprobar la caducidad exacta sin esperar quince minutos.
 */
export function accessTokenExpiry(clock: Clock): AccessTokenExpiry {
  const issuedAt = clock.now();
  // Hacia abajo: redondear hacia arriba alargaría el token casi un segundo de más.
  const issuedAtInSeconds = Math.floor(issuedAt.getTime() / 1000);
  const expiresAtInSeconds = issuedAtInSeconds + ACCESS_TOKEN_TTL_SECONDS;

  return {
    issuedAt,
    expiresAt: new Date(expiresAtInSeconds * 1000),
    issuedAtInSeconds,
    expiresAtInSeconds,
  };
}
