import { describe, expect, it } from 'vitest';

import { FixedClock } from '../time/clock.js';
import {
  type AttemptRecord,
  afterFailedAttempt,
  FAILURE_MEMORY_HOURS,
  FIRST_LOCKOUT_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  MAX_LOCKOUT_MINUTES,
  lockedSecondsLeft,
  lockoutMinutesFor,
} from './login-throttle-policy.js';

const NOW = '2026-09-22T15:00:00.000Z';
const CLOCK = FixedClock.at(NOW);

/** Encadena `times` fallos seguidos en el mismo instante. */
function failTimes(times: number, clock = CLOCK): AttemptRecord {
  let record = afterFailedAttempt(null, clock);

  for (let attempt = 1; attempt < times; attempt++) {
    record = afterFailedAttempt(record, clock);
  }

  return record;
}

describe('how many attempts before the first lock', () => {
  it('allows five', () => {
    expect(LOGIN_MAX_ATTEMPTS).toBe(5);
  });

  it.each([1, 2, 3, 4])('does not lock after %i failures', (failures) => {
    expect(failTimes(failures).lockedUntil).toBeNull();
  });

  it('locks on the fifth', () => {
    expect(failTimes(5).lockedUntil).toEqual(new Date('2026-09-22T15:01:00.000Z'));
  });
});

describe('lockoutMinutesFor', () => {
  it('starts at one minute and never passes a quarter of an hour', () => {
    expect(FIRST_LOCKOUT_MINUTES).toBe(1);
    expect(MAX_LOCKOUT_MINUTES).toBe(15);
  });

  it.each([
    [1, null],
    [4, null],
    [5, 1],
    [6, 2],
    [7, 4],
    [8, 8],
    [9, 15],
  ])('after %i failures locks for %s minutes', (failures, minutes) => {
    expect(lockoutMinutesFor(failures)).toBe(minutes);
  });

  // El tope existe para que nadie pueda dejar al dueño fuera de su cuenta indefinidamente.
  it.each([10, 25, 1000])('never goes past fifteen minutes (%i failures)', (failures) => {
    expect(lockoutMinutesFor(failures)).toBe(MAX_LOCKOUT_MINUTES);
  });
});

describe('after the first lock, every failure locks again', () => {
  it.each([
    [6, '2026-09-22T15:02:00.000Z'],
    [7, '2026-09-22T15:04:00.000Z'],
    [8, '2026-09-22T15:08:00.000Z'],
    [9, '2026-09-22T15:15:00.000Z'],
    [12, '2026-09-22T15:15:00.000Z'],
  ])('failure number %i locks until %s', (failures, until) => {
    expect(failTimes(failures).lockedUntil).toEqual(new Date(until));
  });
});

describe('lockedSecondsLeft', () => {
  const locked: AttemptRecord = {
    failures: 5,
    lastFailureAt: new Date(NOW),
    lockedUntil: new Date('2026-09-22T15:01:00.000Z'),
  };

  it('is zero when nothing was ever tried', () => {
    expect(lockedSecondsLeft(null, CLOCK)).toBe(0);
  });

  it('is zero while there is no lock', () => {
    expect(lockedSecondsLeft({ ...locked, lockedUntil: null }, CLOCK)).toBe(0);
  });

  it('counts the seconds that are left', () => {
    expect(lockedSecondsLeft(locked, CLOCK)).toBe(60);
  });

  // Se redondea hacia arriba: decir "quedan 0 s" cuando aún queda medio segundo haría
  // reintentar demasiado pronto y recibir otro 429.
  it('rounds the wait up to the next whole second', () => {
    const halfway = FixedClock.at('2026-09-22T15:00:59.500Z');

    expect(lockedSecondsLeft(locked, halfway)).toBe(1);
  });

  it('is zero exactly when the lock runs out', () => {
    expect(lockedSecondsLeft(locked, FixedClock.at('2026-09-22T15:01:00.000Z'))).toBe(0);
  });

  it('is zero once the lock is in the past', () => {
    expect(lockedSecondsLeft(locked, FixedClock.at('2026-09-22T15:30:00.000Z'))).toBe(0);
  });
});

describe('forgetting old failures', () => {
  it('forgets after a day without any', () => {
    expect(FAILURE_MEMORY_HOURS).toBe(24);
  });

  it('keeps counting while the failures keep coming', () => {
    const earlier = afterFailedAttempt(null, FixedClock.at('2026-09-22T14:00:00.000Z'));

    expect(afterFailedAttempt(earlier, CLOCK).failures).toBe(2);
  });

  it('still counts a failure just under a day later', () => {
    const almostADayAgo = afterFailedAttempt(null, FixedClock.at('2026-09-21T15:00:00.001Z'));

    expect(afterFailedAttempt(almostADayAgo, CLOCK).failures).toBe(2);
  });

  it('starts over when a whole day went by without failures', () => {
    const aDayAgo = afterFailedAttempt(null, FixedClock.at('2026-09-21T15:00:00.000Z'));

    expect(afterFailedAttempt(aDayAgo, CLOCK)).toEqual({
      failures: 1,
      lastFailureAt: new Date(NOW),
      lockedUntil: null,
    });
  });

  // Quien acumuló bloqueos y desaparece un día vuelve a empezar de cero, no con 15 minutos.
  it('starts over even after many locks', () => {
    const old = { ...failTimes(9), lastFailureAt: new Date('2026-09-20T15:00:00.000Z') };

    expect(afterFailedAttempt(old, CLOCK).lockedUntil).toBeNull();
  });
});

describe('what a failed attempt writes down', () => {
  it('remembers when it happened, from the clock', () => {
    expect(afterFailedAttempt(null, CLOCK)).toEqual({
      failures: 1,
      lastFailureAt: new Date(NOW),
      lockedUntil: null,
    });
  });

  it('reads the instant from the clock, never from the real time', () => {
    const y2030 = FixedClock.at('2030-01-01T00:00:00.000Z');

    expect(afterFailedAttempt(null, y2030).lastFailureAt).toEqual(
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  it('does not change the record it was given', () => {
    const before = failTimes(4);
    const snapshot = { ...before };

    afterFailedAttempt(before, CLOCK);

    expect(before).toEqual(snapshot);
  });
});
