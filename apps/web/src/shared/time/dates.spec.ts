import { FixedClock } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import {
  currentMonth,
  formatDay,
  formatMonth,
  readMonth,
  shiftMonth,
  systemClock,
  todayIn,
} from './dates';

describe('todayIn', () => {
  it('is the date in Lima, not in UTC', () => {
    // 21:30 del 30 de septiembre en Lima ya es 1 de octubre en UTC.
    const clock = FixedClock.at('2026-10-01T02:30:00Z');

    expect(todayIn(clock)).toBe('2026-09-30');
    expect(currentMonth(clock)).toBe('2026-09');
  });

  it('reads the browser clock through systemClock', () => {
    expect(todayIn(systemClock)).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe('shiftMonth', () => {
  it.each([
    ['2026-09', 1, '2026-10'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-09', -21, '2024-12'],
    ['2026-09', 0, '2026-09'],
  ])('moves %s by %i to %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });
});

describe('formatDay and formatMonth', () => {
  it('write the day in Spanish without moving it', () => {
    // `es-PE` escribe «setiembre», como se dice en Perú.
    expect(formatDay('2026-09-28')).toBe('lunes, 28 de setiembre');
    expect(formatDay('2026-01-01')).toBe('jueves, 1 de enero');
  });

  it('write the month in Spanish', () => {
    expect(formatMonth('2026-09')).toBe('setiembre de 2026');
  });
});

describe('readMonth', () => {
  it('takes a month with the expected shape', () => {
    expect(readMonth('2026-12', '2026-09')).toBe('2026-12');
  });

  it.each([null, '', '2026-13', '2026-00', '2026-9', '26-09', '2026-09-01'])(
    'falls back on %s',
    (text) => {
      expect(readMonth(text, '2026-09')).toBe('2026-09');
    },
  );
});
