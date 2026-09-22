import type { Clock } from '../time/clock.js';

/**
 * Cuántos intentos fallidos seguidos se toleran antes del primer bloqueo.
 *
 * Con cinco, quien se equivoca escribiendo no nota nada; quien prueba contraseñas, sí.
 */
export const LOGIN_MAX_ATTEMPTS = 5;

/**
 * Cuánto dura cada bloqueo, en minutos: **1 → 2 → 4 → 8 → 15**.
 *
 * Después del primero, **cada** fallo vuelve a bloquear y el tiempo se **dobla**, hasta el tope.
 */
export const FIRST_LOCKOUT_MINUTES = 1;

/**
 * Más de esto no dura un bloqueo, por mucho que sigan los fallos.
 *
 * El tope es deliberado: sin él, un tercero podría dejar al dueño fuera de su propia cuenta
 * indefinidamente sin más que fallar a propósito desde cualquier parte.
 */
export const MAX_LOCKOUT_MINUTES = 15;

/** Tras un día entero sin fallos, la cuenta de fallos vuelve a cero. */
export const FAILURE_MEMORY_HOURS = 24;

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

/** Lo que se sabe de los intentos fallidos de una llave (un correo o una IP). */
export interface AttemptRecord {
  failures: number;
  lastFailureAt: Date;
  /** Hasta cuándo no se aceptan intentos. `null` mientras no haya bloqueo. */
  lockedUntil: Date | null;
}

/** Cuánto bloquea el enésimo fallo seguido, o `null` si todavía no bloquea. */
export function lockoutMinutesFor(failures: number): number | null {
  if (failures < LOGIN_MAX_ATTEMPTS) return null;

  // Se dobla en cada fallo a partir del quinto, y nunca pasa del tope: 1, 2, 4, 8, 15, 15…
  const doubled = FIRST_LOCKOUT_MINUTES * 2 ** (failures - LOGIN_MAX_ATTEMPTS);

  return Math.min(doubled, MAX_LOCKOUT_MINUTES);
}

/**
 * El registro que deja un intento fallido. No modifica el anterior: devuelve uno nuevo.
 *
 * Si el último fallo fue hace un día o más, se empieza de cero: los tropiezos de la semana
 * pasada no deben sumarse a los de hoy.
 */
export function afterFailedAttempt(record: AttemptRecord | null, clock: Clock): AttemptRecord {
  const now = clock.now();
  const failures = record === null || hasBeenForgotten(record, now) ? 1 : record.failures + 1;
  const minutes = lockoutMinutesFor(failures);

  return {
    failures,
    lastFailureAt: now,
    lockedUntil:
      minutes === null ? null : new Date(now.getTime() + minutes * MILLISECONDS_PER_MINUTE),
  };
}

/**
 * Segundos que faltan para poder volver a intentarlo. `0` significa que no hay bloqueo.
 *
 * Se redondea hacia arriba: decir que no queda nada cuando aún falta medio segundo llevaría a
 * reintentar demasiado pronto y recibir otro rechazo.
 */
export function lockedSecondsLeft(record: AttemptRecord | null, clock: Clock): number {
  if (record?.lockedUntil == null) return 0;

  const remaining = record.lockedUntil.getTime() - clock.now().getTime();

  // Nunca negativo: un bloqueo que ya pasó no es "menos que nada" de espera, es ninguna.
  return Math.max(0, Math.ceil(remaining / 1000));
}

function hasBeenForgotten(record: AttemptRecord, now: Date): boolean {
  return (
    now.getTime() - record.lastFailureAt.getTime() >= FAILURE_MEMORY_HOURS * MILLISECONDS_PER_HOUR
  );
}
