import { describe, expect, it } from 'vitest';

import { FixedClock } from '../time/clock.js';
import { ACCESS_TOKEN_TTL_SECONDS, accessTokenExpiry } from './session-policy.js';

const CLOCK = FixedClock.at('2026-09-20T15:00:00.000Z');

describe('access token lifetime', () => {
  it('lasts fifteen minutes', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
  });

  it('expires that long after it was issued', () => {
    const { issuedAt, expiresAt } = accessTokenExpiry(CLOCK);

    expect(issuedAt).toEqual(new Date('2026-09-20T15:00:00.000Z'));
    expect(expiresAt).toEqual(new Date('2026-09-20T15:15:00.000Z'));
  });

  it('reads the instant from the clock, never from the real time', () => {
    const later = FixedClock.at('2030-01-01T00:00:00.000Z');

    expect(accessTokenExpiry(later).issuedAt).toEqual(new Date('2030-01-01T00:00:00.000Z'));
  });

  // Un JWT cuenta el tiempo en segundos: con milisegundos, `exp` saldría mil veces mayor.
  it('reports both instants in whole seconds, as a JWT counts them', () => {
    const { issuedAtInSeconds, expiresAtInSeconds } = accessTokenExpiry(CLOCK);

    expect(issuedAtInSeconds).toBe(Math.floor(CLOCK.now().getTime() / 1000));
    expect(expiresAtInSeconds - issuedAtInSeconds).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('rounds down a clock that is mid-second, so the token never lasts longer than it should', () => {
    const midSecond = FixedClock.at('2026-09-20T15:00:00.999Z');

    expect(accessTokenExpiry(midSecond).issuedAtInSeconds).toBe(
      accessTokenExpiry(CLOCK).issuedAtInSeconds,
    );
  });
});
