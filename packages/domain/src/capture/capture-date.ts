import { PERU_TIME_ZONE } from '../time/clock.js';
import { LocalDate } from '../time/local-date.js';
import { type CaptureDomainWarning } from './capture-amount.js';

/** Desde cuántos días atrás una captura se marca como vieja (decisión 5 de H7). */
export const CAPTURE_MAX_AGE_DAYS = 30;

export interface CaptureDate {
  date: LocalDate;
  warnings: CaptureDomainWarning[];
}

/**
 * La fecha de negocio de una captura: el día de `occurredAt` **en Lima** (decisión 5). La
 * captura **se guarda siempre**, con aviso si la fecha es rara, y se corrige al confirmar:
 *
 * - un día futuro (el reloj del teléfono adelantado) queda en **hoy**, con `FUTURE_DATE`. Unos
 *   minutos adelantados dentro del mismo día no avisan: el día es el mismo;
 * - un día de **más de 30 días** atrás se guarda tal cual, con `OLD_DATE`. Justo 30, no avisa.
 *
 * `now` es el instante en que llega, del puerto `Clock`.
 */
export function captureBusinessDate(occurredAt: Date, now: Date): CaptureDate {
  const date = LocalDate.fromInstant(occurredAt, PERU_TIME_ZONE);
  const today = LocalDate.fromInstant(now, PERU_TIME_ZONE);

  if (date.isAfter(today)) return { date: today, warnings: ['FUTURE_DATE'] };
  if (date.isBefore(today.plusDays(-CAPTURE_MAX_AGE_DAYS))) {
    return { date, warnings: ['OLD_DATE'] };
  }
  return { date, warnings: [] };
}
