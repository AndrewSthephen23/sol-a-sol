import { describe, expect, it } from 'vitest';

import { FixedClock } from '../time/clock.js';
import {
  isCounterFresh,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  totpCounter,
  totpCountersToAccept,
} from './totp-policy.js';

const CLOCK = FixedClock.at('2026-09-21T12:00:00.000Z');
// 2026-09-21T12:00:00Z son 1 789 992 000 segundos, divisibles entre 30: contador 59 666 400.
const COUNTER = 59_666_400;

describe('the shape every authenticator app expects', () => {
  it('uses six digits', () => {
    expect(TOTP_DIGITS).toBe(6);
  });

  it('changes the code every thirty seconds', () => {
    expect(TOTP_PERIOD_SECONDS).toBe(30);
  });
});

describe('totpCounter', () => {
  it('counts periods of thirty seconds since 1970', () => {
    expect(totpCounter(CLOCK)).toBe(COUNTER);
  });

  it('does not move within the same period', () => {
    expect(totpCounter(FixedClock.at('2026-09-21T12:00:29.999Z'))).toBe(COUNTER);
  });

  it('moves on at the next period', () => {
    expect(totpCounter(FixedClock.at('2026-09-21T12:00:30.000Z'))).toBe(COUNTER + 1);
  });
});

describe('totpCountersToAccept', () => {
  // Un desfase de reloj de pocos segundos no debe impedir entrar; uno de minutos, sí.
  it('accepts the current code, the previous one and the next one', () => {
    expect(totpCountersToAccept(CLOCK)).toEqual([COUNTER - 1, COUNTER, COUNTER + 1]);
  });

  it('accepts one period either side, and no more', () => {
    expect(TOTP_WINDOW_STEPS).toBe(1);
    expect(totpCountersToAccept(CLOCK)).toHaveLength(2 * TOTP_WINDOW_STEPS + 1);
  });

  it('leaves out a code from three periods ago', () => {
    expect(totpCountersToAccept(CLOCK)).not.toContain(COUNTER - 3);
  });

  it('leaves out a code from three periods ahead', () => {
    expect(totpCountersToAccept(CLOCK)).not.toContain(COUNTER + 3);
  });

  it('follows the clock it is given, never the real time', () => {
    const later = FixedClock.at('2026-09-21T12:01:00.000Z');

    expect(totpCountersToAccept(later)).toEqual([COUNTER + 1, COUNTER + 2, COUNTER + 3]);
  });
});

describe('isCounterFresh', () => {
  // Sin esto, quien ve el código por encima del hombro lo puede usar en los siguientes segundos.
  it('rejects the counter that was already used', () => {
    expect(isCounterFresh(COUNTER, COUNTER)).toBe(false);
  });

  it('rejects a counter older than the last one used', () => {
    expect(isCounterFresh(COUNTER - 1, COUNTER)).toBe(false);
  });

  it('accepts a later counter', () => {
    expect(isCounterFresh(COUNTER + 1, COUNTER)).toBe(true);
  });

  it('accepts any counter when the account has never used one', () => {
    expect(isCounterFresh(COUNTER, null)).toBe(true);
  });
});
