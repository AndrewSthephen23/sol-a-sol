import { describe, expect, it } from 'vitest';

import { type Clock, FixedClock, PERU_TIME_ZONE, today } from './clock.js';
import { InvalidInstantError } from './local-date.js';

describe('FixedClock', () => {
  it('always returns the same instant', () => {
    const clock = FixedClock.at('2026-09-17T15:00:00Z');

    expect(clock.now().toISOString()).toBe('2026-09-17T15:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-09-17T15:00:00.000Z');
  });

  it('does not expose a mutable instant', () => {
    const clock = FixedClock.at('2026-09-17T15:00:00Z');

    clock.now().setFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-09-17T15:00:00.000Z');
  });

  it('accepts a Date and copies it', () => {
    const instant = new Date('2026-09-17T15:00:00Z');
    const clock = FixedClock.at(instant);

    instant.setFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-09-17T15:00:00.000Z');
  });

  it('rejects an invalid instant', () => {
    expect(() => FixedClock.at('not a date')).toThrow(InvalidInstantError);
  });
});

describe('today', () => {
  it('uses Lima time by default', () => {
    // 02:30 UTC del 18 todavía es 21:30 del 17 en Lima (UTC-5).
    const clock = FixedClock.at('2026-09-18T02:30:00Z');

    expect(today(clock).toString()).toBe('2026-09-17');
    expect(PERU_TIME_ZONE).toBe('America/Lima');
  });

  it('accepts another time zone', () => {
    const clock = FixedClock.at('2026-09-18T02:30:00Z');

    expect(today(clock, 'UTC').toString()).toBe('2026-09-18');
  });

  it('works with any Clock implementation', () => {
    const clock: Clock = { now: () => new Date('2026-12-31T20:00:00Z') };

    expect(today(clock).toString()).toBe('2026-12-31');
  });
});
