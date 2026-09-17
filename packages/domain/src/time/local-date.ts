import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Formato peruano: día primero. Solo se usa cuando quien llama sabe que el origen lo escribe así. */
const DAY_FIRST_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const MONTHS_PER_YEAR = 12;
const MAX_DAY_OF_MONTH = 31;
/** Abril, junio, septiembre y noviembre. */
const SHORT_MONTHS = new Set([4, 6, 9, 11]);

export class InvalidLocalDateError extends DomainError {
  readonly code = 'INVALID_LOCAL_DATE';

  constructor(readonly description: string) {
    super(`Invalid date: ${description}`);
  }
}

export class InvalidInstantError extends DomainError {
  readonly code = 'INVALID_INSTANT';

  constructor(readonly value: unknown) {
    super(`Invalid instant: ${describeValue(value)}`);
  }
}

export class InvalidTimeZoneError extends DomainError {
  readonly code = 'INVALID_TIME_ZONE';

  constructor(readonly timeZone: string) {
    super(`Unsupported time zone: ${describeValue(timeZone)}`);
  }
}

/**
 * Fecha de negocio **sin hora**: la fecha de una transacción, un día de corte, un vencimiento.
 *
 * La aritmética es con enteros, no con `Date`: `new Date(año, mes, día)` usa la zona horaria de la
 * máquina, así que el mismo cálculo daría distinto en una laptop y en CI. Para convertir un
 * instante (un `createdAt` en UTC) a fecha de negocio se usa `fromInstant` con una zona explícita.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static of(year: number, month: number, day: number): LocalDate {
    if (
      !isInteger(year) ||
      !isInteger(month) ||
      !isInteger(day) ||
      month < 1 ||
      month > MONTHS_PER_YEAR ||
      day < 1 ||
      day > daysInMonth(year, month)
    ) {
      throw new InvalidLocalDateError(formatParts(year, month, day));
    }
    return new LocalDate(year, month, day);
  }

  /** Lee una fecha ISO (`2026-09-17`), el formato de la API y de la base de datos. */
  static parse(text: string): LocalDate {
    return fromPattern(text, ISO_PATTERN, [1, 2, 3]);
  }

  /** Lee una fecha peruana (`17/09/2026`). Solo para orígenes que se sabe que la escriben así. */
  static parseDayFirst(text: string): LocalDate {
    return fromPattern(text, DAY_FIRST_PATTERN, [3, 2, 1]);
  }

  /** Fecha de negocio que corresponde a un instante en una zona horaria concreta. */
  static fromInstant(instant: Date, timeZone: string): LocalDate {
    if (Number.isNaN(instant.getTime())) {
      throw new InvalidInstantError(instant);
    }
    const parts = formatInTimeZone(instant, timeZone);
    return LocalDate.of(
      partValue(parts, 'year'),
      partValue(parts, 'month'),
      partValue(parts, 'day'),
    );
  }

  plusDays(days: number): LocalDate {
    if (!isInteger(days)) {
      throw new InvalidLocalDateError(`${this.toString()} + ${String(days)} days`);
    }
    return fromEpochDay(this.toEpochDay() + days);
  }

  /**
   * Suma meses conservando el día. Si el día no existe en el mes destino (un 31 en un mes de 30),
   * se ajusta al último día: es lo que hacen los bancos con el día de corte.
   */
  plusMonths(months: number): LocalDate {
    if (!isInteger(months)) {
      throw new InvalidLocalDateError(`${this.toString()} + ${String(months)} months`);
    }
    const total = this.year * MONTHS_PER_YEAR + (this.month - 1) + months;
    const year = Math.floor(total / MONTHS_PER_YEAR);
    const month = total - year * MONTHS_PER_YEAR + 1;
    return LocalDate.of(year, month, Math.min(this.day, daysInMonth(year, month)));
  }

  lastDayOfMonth(): LocalDate {
    return LocalDate.of(this.year, this.month, daysInMonth(this.year, this.month));
  }

  /** Mueve la fecha a ese día del mes, ajustando al último día si el mes es más corto. */
  withDayOfMonth(day: number): LocalDate {
    if (!isInteger(day) || day < 1 || day > MAX_DAY_OF_MONTH) {
      throw new InvalidLocalDateError(`day ${String(day)}`);
    }
    return LocalDate.of(this.year, this.month, Math.min(day, daysInMonth(this.year, this.month)));
  }

  /** Días que faltan hasta `other`; negativo si `other` ya pasó. */
  daysUntil(other: LocalDate): number {
    return other.toEpochDay() - this.toEpochDay();
  }

  compareTo(other: LocalDate): number {
    return this.toEpochDay() - other.toEpochDay();
  }

  isBefore(other: LocalDate): boolean {
    return this.compareTo(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compareTo(other) > 0;
  }

  equals(other: LocalDate): boolean {
    return this.compareTo(other) === 0;
  }

  toString(): string {
    return formatParts(this.year, this.month, this.day);
  }

  /** Días transcurridos desde 1970-01-01 (algoritmo civil de Howard Hinnant). */
  private toEpochDay(): number {
    const year = this.year - (this.month <= 2 ? 1 : 0);
    const era = Math.floor(year / 400);
    const yearOfEra = year - era * 400;
    const dayOfYear =
      Math.floor((153 * (this.month + (this.month > 2 ? -3 : 9)) + 2) / 5) + this.day - 1;
    const dayOfEra =
      yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
    return era * 146_097 + dayOfEra - 719_468;
  }
}

function fromEpochDay(epochDay: number): LocalDate {
  const shifted = epochDay + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex + (monthIndex < 10 ? 3 : -9);
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return LocalDate.of(year, month, day);
}

function fromPattern(
  text: string,
  pattern: RegExp,
  [yearGroup, monthGroup, dayGroup]: readonly [number, number, number],
): LocalDate {
  if (typeof text !== 'string') {
    throw new InvalidLocalDateError(describeValue(text));
  }
  const match = pattern.exec(text.trim());
  if (match === null) {
    throw new InvalidLocalDateError(describeValue(text));
  }
  return LocalDate.of(Number(match[yearGroup]), Number(match[monthGroup]), Number(match[dayGroup]));
}

function formatInTimeZone(instant: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
  } catch {
    throw new InvalidTimeZoneError(timeZone);
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return SHORT_MONTHS.has(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function formatParts(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}
