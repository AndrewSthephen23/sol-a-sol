import { type Clock, today } from '@sol-a-sol/domain';

/**
 * El reloj del navegador: el único sitio de la web que lee la hora actual. Lo demás recibe un
 * `Clock`, y "hoy" lo decide el dominio en la hora de Lima (`today`), no el componente.
 */
export const systemClock: Clock = { now: () => new Date() };

/** Hoy en Lima, `YYYY-MM-DD`. */
export function todayIn(clock: Clock): string {
  return today(clock).toString();
}

/** El mes de hoy en Lima, `YYYY-MM`. */
export function currentMonth(clock: Clock): string {
  return todayIn(clock).slice(0, 7);
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

/** El mes que trae la URL (`?month=2026-09`) o, si no tiene esa forma, el que se pasa por defecto. */
export function readMonth(text: string | null, fallback: string): string {
  return text !== null && MONTH.test(text) ? text : fallback;
}

/** `2026-09` más o menos `delta` meses, cruzando años. Aritmética de calendario, sin horas. */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  const shiftedYear = Math.floor(index / 12);
  const shiftedMonth = (index % 12) + 1;

  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/**
 * Los nombres se piden a `Intl` para un mediodía UTC del día dado y se formatean **en UTC**: así
 * ninguna zona horaria mueve el día. Es solo el calendario, no un instante.
 */
function calendarDay(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day, 12));
}

const DAY_HEADING = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const MONTH_HEADING = new Intl.DateTimeFormat('es-PE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-09-28` → `lunes, 28 de setiembre` (`es-PE` dice «setiembre»). */
export function formatDay(date: string): string {
  return DAY_HEADING.format(calendarDay(date));
}

/** `2026-09` → `setiembre de 2026`. */
export function formatMonth(month: string): string {
  return MONTH_HEADING.format(calendarDay(`${month}-01`));
}
