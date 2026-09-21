import type { Clock } from '../time/clock.js';

/**
 * Reglas del segundo factor TOTP (RFC 6238). Aquí solo vive lo que es puro: qué códigos se
 * aceptan y cuándo. Calcular el código a partir del secreto necesita HMAC, y eso es
 * infraestructura.
 *
 * Seis dígitos cada treinta segundos: no es una preferencia, es lo que hacen todas las
 * aplicaciones de autenticación (Google Authenticator, Aegis, 1Password, Bitwarden).
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

/**
 * Cuántos periodos se aceptan a cada lado del actual.
 *
 * Uno: un desfase de reloj de unos segundos no debe impedir entrar, pero una ventana más ancha
 * alarga la vida de un código que alguien vio por encima del hombro.
 */
export const TOTP_WINDOW_STEPS = 1;

/** Periodos de treinta segundos transcurridos desde 1970, que es lo que TOTP cuenta. */
export function totpCounter(clock: Clock): number {
  return Math.floor(clock.now().getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** Los contadores cuyos códigos se dan por buenos ahora mismo, del más viejo al más nuevo. */
export function totpCountersToAccept(clock: Clock): number[] {
  const current = totpCounter(clock);
  const counters: number[] = [];

  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset++) {
    counters.push(current + offset);
  }

  return counters;
}

/**
 * Si un contador todavía no se ha gastado.
 *
 * Un código sirve **una sola vez**: sin esto, quien lo vea por encima del hombro podría usarlo
 * durante el resto de su ventana. `null` significa que la cuenta nunca ha usado ninguno.
 */
export function isCounterFresh(counter: number, lastUsedCounter: number | null): boolean {
  return lastUsedCounter === null || counter > lastUsedCounter;
}
