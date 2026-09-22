import type { Clock } from '../time/clock.js';

/**
 * Cuánto se conservan las entradas de la bitácora: **un año** (decisión del autor).
 *
 * Es lo habitual para bitácoras de seguridad y da margen para investigar un incidente que se
 * descubre tarde. Pasado ese tiempo se borran, porque guardan datos personales (IP y user agent)
 * que ya no sirven para nada.
 */
export const AUDIT_LOG_RETENTION_DAYS = 365;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Instante anterior al cual una entrada ya se puede borrar. */
export function auditLogCutoff(clock: Clock): Date {
  return new Date(clock.now().getTime() - AUDIT_LOG_RETENTION_DAYS * MILLISECONDS_PER_DAY);
}
