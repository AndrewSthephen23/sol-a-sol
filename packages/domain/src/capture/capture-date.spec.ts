import { describe, expect, it } from 'vitest';

import { captureBusinessDate } from './capture-date.js';

/** 3 de octubre de 2026, 10:00 en Lima. */
const NOW = new Date('2026-10-03T15:00:00.000Z');

function read(occurredAt: string) {
  const { date, warnings } = captureBusinessDate(new Date(occurredAt), NOW);
  return { date: date.toString(), warnings };
}

describe('captureBusinessDate', () => {
  it('is the day of the instant in Lima', () => {
    expect(read('2026-10-03T14:00:00.000Z')).toEqual({ date: '2026-10-03', warnings: [] });
  });

  it('keeps 21:30 in Lima on its day, though it is the next one in UTC', () => {
    expect(read('2026-10-03T02:30:00.000Z')).toEqual({ date: '2026-10-02', warnings: [] });
  });

  it('takes 00:30 in Lima as the new day', () => {
    expect(read('2026-10-02T05:30:00.000Z')).toEqual({ date: '2026-10-02', warnings: [] });
  });

  it('does not warn about a phone clock a little ahead, on the same day', () => {
    expect(read('2026-10-03T15:05:00.000Z')).toEqual({ date: '2026-10-03', warnings: [] });
  });

  it('keeps a future day as today, with a warning (decision 5)', () => {
    expect(read('2026-10-04T15:00:00.000Z')).toEqual({
      date: '2026-10-03',
      warnings: ['FUTURE_DATE'],
    });
  });

  it('keeps a capture of exactly 30 days ago without a warning', () => {
    expect(read('2026-09-03T15:00:00.000Z')).toEqual({ date: '2026-09-03', warnings: [] });
  });

  it('keeps a capture of more than 30 days ago, with a warning (decision 5)', () => {
    expect(read('2026-09-02T15:00:00.000Z')).toEqual({
      date: '2026-09-02',
      warnings: ['OLD_DATE'],
    });
  });
});
