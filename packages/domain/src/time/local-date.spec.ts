import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain-error.js';
import {
  InvalidInstantError,
  InvalidLocalDateError,
  InvalidTimeZoneError,
  LocalDate,
} from './local-date.js';

describe('LocalDate', () => {
  describe('of', () => {
    it('creates a business date without time', () => {
      const date = LocalDate.of(2026, 9, 17);

      expect(date.year).toBe(2026);
      expect(date.month).toBe(9);
      expect(date.day).toBe(17);
      expect(date.toString()).toBe('2026-09-17');
    });

    it('pads month and day', () => {
      expect(LocalDate.of(2026, 1, 5).toString()).toBe('2026-01-05');
    });

    it('accepts 29 February on a leap year', () => {
      expect(LocalDate.of(2024, 2, 29).toString()).toBe('2024-02-29');
    });

    it.each([
      ['29 February on a common year', 2026, 2, 29],
      ['31 April', 2026, 4, 31],
      ['month 0', 2026, 0, 10],
      ['month 13', 2026, 13, 10],
      ['day 0', 2026, 9, 0],
      ['day 32', 2026, 9, 32],
      ['a fractional day', 2026, 9, 17.5],
      ['NaN', 2026, 9, Number.NaN],
    ])('rejects %s', (_description, year, month, day) => {
      expect(() => LocalDate.of(year, month, day)).toThrow(InvalidLocalDateError);
    });

    it.each([
      ['the first day of the year', 2026, 1, 1],
      ['the last day of the year', 2026, 12, 31],
      ['the last day of a 30-day month', 2026, 4, 30],
    ])('accepts %s', (_description, year, month, day) => {
      expect(() => LocalDate.of(year, month, day)).not.toThrow();
    });

    it.each([
      ['a fractional year', 2026.5, 9, 17],
      ['a fractional month', 2026, 9.5, 17],
    ])('rejects %s', (_description, year, month, day) => {
      expect(() => LocalDate.of(year, month, day)).toThrow(InvalidLocalDateError);
    });

    it('reports the rejected date with a stable code', () => {
      const error = capture(() => LocalDate.of(2026, 2, 30));

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        name: 'InvalidLocalDateError',
        code: 'INVALID_LOCAL_DATE',
        message: 'Invalid date: 2026-02-30',
      });
    });
  });

  describe('parse (ISO)', () => {
    it('reads an ISO date', () => {
      expect(LocalDate.parse('2026-09-17').toString()).toBe('2026-09-17');
    });

    it.each([
      ['a day-first date', '17/09/2026'],
      ['a date without padding', '2026-9-7'],
      ['a date that does not exist', '2026-02-30'],
      ['a date with time', '2026-09-17T10:00:00Z'],
      ['an empty string', ''],
      ['text', 'hoy'],
    ])('rejects %s', (_description, text) => {
      expect(() => LocalDate.parse(text)).toThrow(InvalidLocalDateError);
    });

    it('ignores surrounding spaces', () => {
      expect(LocalDate.parse('  2026-09-17  ').toString()).toBe('2026-09-17');
    });

    it.each([
      ['text before the date', 'x2026-09-17'],
      ['text after the date', '2026-09-17x'],
    ])('rejects %s', (_description, invalid) => {
      expect(() => LocalDate.parse(invalid)).toThrow(InvalidLocalDateError);
    });

    it('rejects a value that is not a string', () => {
      expect(() => LocalDate.parse(20260917 as never)).toThrow(InvalidLocalDateError);
    });
  });

  describe('parseDayFirst (Peruvian format)', () => {
    it.each([
      ['17/09/2026', '2026-09-17'],
      ['7/9/2026', '2026-09-07'],
      ['01/01/2027', '2027-01-01'],
    ])('reads %j as %s', (text, expected) => {
      expect(LocalDate.parseDayFirst(text).toString()).toBe(expected);
    });

    it.each([
      ['an ISO date', '2026-09-17'],
      ['a month-first date', '13/13/2026'],
      ['a date that does not exist', '31/04/2026'],
      ['a two digit year', '17/09/26'],
      ['an empty string', ''],
      ['text before the date', 'x17/09/2026'],
      ['text after the date', '17/09/2026x'],
    ])('rejects %s', (_description, text) => {
      expect(() => LocalDate.parseDayFirst(text)).toThrow(InvalidLocalDateError);
    });
  });

  describe('comparisons', () => {
    // Las fechas se construyen dentro de cada prueba: hacerlo en los argumentos de `it.each`
    // las evalúa al recolectar, y un error ahí tumba el archivo entero en vez de una prueba.
    it.each([
      ['a later date', '2026-09-18', true, false],
      ['an earlier date', '2026-09-16', false, true],
      ['the same date', '2026-09-17', false, false],
      ['a later month', '2026-10-01', true, false],
      ['a later year', '2027-01-01', true, false],
    ])('compares with %s', (_description, other, isBefore, isAfter) => {
      const date = LocalDate.of(2026, 9, 17);

      expect(date.isBefore(LocalDate.parse(other))).toBe(isBefore);
      expect(date.isAfter(LocalDate.parse(other))).toBe(isAfter);
    });

    it('is equal only to the same calendar date', () => {
      const date = LocalDate.of(2026, 9, 17);

      expect(date.equals(LocalDate.of(2026, 9, 17))).toBe(true);
      expect(date.equals(LocalDate.of(2026, 9, 18))).toBe(false);
      expect(date.equals(LocalDate.of(2026, 10, 17))).toBe(false);
      expect(date.equals(LocalDate.of(2027, 9, 17))).toBe(false);
    });

    it('sorts chronologically', () => {
      const dates = [
        LocalDate.of(2026, 10, 1),
        LocalDate.of(2026, 9, 17),
        LocalDate.of(2027, 1, 1),
      ];

      expect(dates.toSorted((a, b) => a.compareTo(b)).map(String)).toEqual([
        '2026-09-17',
        '2026-10-01',
        '2027-01-01',
      ]);
    });
  });

  describe('plusDays', () => {
    it.each([
      ['2026-09-17', 1, '2026-09-18'],
      ['2026-09-17', 0, '2026-09-17'],
      ['2026-09-17', -1, '2026-09-16'],
      ['2026-01-31', 1, '2026-02-01'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2027-01-01', -1, '2026-12-31'],
      ['2024-02-28', 1, '2024-02-29'],
      ['2026-02-28', 1, '2026-03-01'],
      ['2026-09-17', 30, '2026-10-17'],
    ])('%s plus %i days is %s', (from, days, expected) => {
      expect(LocalDate.parse(from).plusDays(days).toString()).toBe(expected);
    });

    it('rejects a fractional number of days', () => {
      const error = capture(() => LocalDate.of(2026, 9, 17).plusDays(1.5));

      expect(error).toBeInstanceOf(InvalidLocalDateError);
      expect(error.message).toBe('Invalid date: 2026-09-17 + 1.5 days');
    });
  });

  describe('plusMonths', () => {
    it.each([
      ['2026-09-17', 1, '2026-10-17'],
      ['2026-09-17', -1, '2026-08-17'],
      ['2026-12-17', 1, '2027-01-17'],
      ['2026-01-17', -1, '2025-12-17'],
      ['2026-09-17', 12, '2027-09-17'],
      // Día de corte 31 en meses más cortos: se ajusta al último día del mes.
      ['2026-01-31', 1, '2026-02-28'],
      ['2024-01-31', 1, '2024-02-29'],
      ['2026-01-31', 3, '2026-04-30'],
      ['2026-03-31', -1, '2026-02-28'],
    ])('%s plus %i months is %s', (from, months, expected) => {
      expect(LocalDate.parse(from).plusMonths(months).toString()).toBe(expected);
    });

    it('rejects a fractional number of months', () => {
      const error = capture(() => LocalDate.of(2026, 9, 17).plusMonths(1.5));

      expect(error).toBeInstanceOf(InvalidLocalDateError);
      expect(error.message).toBe('Invalid date: 2026-09-17 + 1.5 months');
    });
  });

  describe('lastDayOfMonth and withDayOfMonth', () => {
    it.each([
      ['2026-02-10', '2026-02-28'],
      ['2024-02-10', '2024-02-29'],
      ['2026-04-10', '2026-04-30'],
      ['2026-12-10', '2026-12-31'],
    ])('the last day of the month of %s is %s', (from, expected) => {
      expect(LocalDate.parse(from).lastDayOfMonth().toString()).toBe(expected);
    });

    it.each([
      // Un día de corte 31 en un mes de 30 días cierra el último día.
      ['2026-04-10', 31, '2026-04-30'],
      ['2026-02-10', 31, '2026-02-28'],
      ['2024-02-10', 30, '2024-02-29'],
      ['2026-09-10', 5, '2026-09-05'],
      ['2026-09-10', 30, '2026-09-30'],
    ])('%s with statement day %i is %s', (from, day, expected) => {
      expect(LocalDate.parse(from).withDayOfMonth(day).toString()).toBe(expected);
    });

    it('keeps the first day of the month', () => {
      expect(LocalDate.of(2026, 9, 10).withDayOfMonth(1).toString()).toBe('2026-09-01');
    });

    it.each([0, 32, 1.5])('rejects the statement day %s', (day) => {
      const error = capture(() => LocalDate.of(2026, 9, 10).withDayOfMonth(day));

      expect(error).toBeInstanceOf(InvalidLocalDateError);
      expect(error.message).toBe(`Invalid date: day ${String(day)}`);
    });
  });

  describe('daysUntil', () => {
    it.each([
      ['2026-09-17', '2026-09-20', 3],
      ['2026-09-17', '2026-09-17', 0],
      ['2026-09-20', '2026-09-17', -3],
      ['2026-01-31', '2026-02-01', 1],
      ['2026-12-31', '2027-01-01', 1],
      ['2024-02-28', '2024-03-01', 2],
      ['2026-02-28', '2026-03-01', 1],
      ['2026-01-01', '2027-01-01', 365],
    ])('from %s to %s there are %i days', (from, to, expected) => {
      expect(LocalDate.parse(from).daysUntil(LocalDate.parse(to))).toBe(expected);
    });
  });

  describe('fromInstant', () => {
    it('uses the date in the given time zone, not the UTC one', () => {
      // 02:30 UTC del 18 todavía es 21:30 del 17 en Lima (UTC-5).
      const instant = new Date('2026-09-18T02:30:00Z');

      expect(LocalDate.fromInstant(instant, 'America/Lima').toString()).toBe('2026-09-17');
      expect(LocalDate.fromInstant(instant, 'UTC').toString()).toBe('2026-09-18');
    });

    it('handles the exact start of the day in Lima', () => {
      expect(
        LocalDate.fromInstant(new Date('2026-09-17T05:00:00Z'), 'America/Lima').toString(),
      ).toBe('2026-09-17');
      expect(
        LocalDate.fromInstant(new Date('2026-09-17T04:59:59Z'), 'America/Lima').toString(),
      ).toBe('2026-09-16');
    });

    it('rejects a time zone that does not exist', () => {
      const error = capture(() =>
        LocalDate.fromInstant(new Date('2026-09-17T12:00:00Z'), 'Mars/Base'),
      );

      expect(error).toBeInstanceOf(InvalidTimeZoneError);
      expect(error).toMatchObject({ code: 'INVALID_TIME_ZONE', timeZone: 'Mars/Base' });
      expect(error.message).toBe('Unsupported time zone: "Mars/Base"');
    });

    it('rejects an invalid instant with a stable code', () => {
      const error = capture(() => LocalDate.fromInstant(new Date('not a date'), 'America/Lima'));

      expect(error).toBeInstanceOf(InvalidInstantError);
      expect(error).toMatchObject({ name: 'InvalidInstantError', code: 'INVALID_INSTANT' });
      expect(error.message).toBe('Invalid instant: Invalid Date');
    });
  });
});

describe('LocalDate: centuries and leap years', () => {
  it('accepts 29 February in a year divisible by 400', () => {
    expect(LocalDate.of(2000, 2, 29).toString()).toBe('2000-02-29');
  });

  it('rejects 29 February in a year divisible by 100 but not by 400', () => {
    expect(() => LocalDate.of(1900, 2, 29)).toThrow(InvalidLocalDateError);
  });

  it.each([
    ['2000-02-28', 1, '2000-02-29'],
    ['2000-02-29', 1, '2000-03-01'],
    ['1900-02-28', 1, '1900-03-01'],
    ['1899-12-31', 1, '1900-01-01'],
    ['2000-12-31', 1, '2001-01-01'],
    ['2000-03-01', -1, '2000-02-29'],
    ['1900-03-01', -1, '1900-02-28'],
    ['2026-09-17', 365, '2027-09-17'],
    ['2024-01-01', 366, '2025-01-01'],
  ])('%s plus %i days is %s', (from, days, expected) => {
    expect(LocalDate.parse(from).plusDays(days).toString()).toBe(expected);
  });

  it.each([
    ['2026-01-01', '2026-12-31', 364],
    ['2024-01-01', '2024-12-31', 365],
    ['1900-01-01', '1900-12-31', 364],
    ['2000-01-01', '2000-12-31', 365],
    ['1970-01-01', '2000-01-01', 10_957],
  ])('from %s to %s there are %i days', (from, to, expected) => {
    expect(LocalDate.parse(from).daysUntil(LocalDate.parse(to))).toBe(expected);
  });

  it.each([
    ['1900-01-31', '1900-02-28'],
    ['2000-01-31', '2000-02-29'],
  ])('a statement day 31 on %s closes on %s', (from, expected) => {
    expect(LocalDate.parse(from).plusMonths(1).toString()).toBe(expected);
  });
});

function capture(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Expected a DomainError to be thrown');
}
