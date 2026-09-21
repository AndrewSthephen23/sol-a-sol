import { describe, expect, it } from 'vitest';

import { FixedClock } from '../time/clock.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  accessTokenExpiry,
  hasExpired,
  REFRESH_TOKEN_TTL_SECONDS,
  refreshTokenExpiresAt,
} from './session-policy.js';

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

describe('refresh token lifetime', () => {
  it('lasts thirty days', () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('expires that long after it was issued', () => {
    expect(refreshTokenExpiresAt(CLOCK)).toEqual(new Date('2026-10-20T15:00:00.000Z'));
  });

  // Deslizante: cada uso emite uno nuevo con treinta días por delante, así que quien entra a
  // diario no vuelve a escribir la contraseña.
  it('starts its thirty days again on every use', () => {
    const later = FixedClock.at('2026-10-15T15:00:00.000Z');

    expect(refreshTokenExpiresAt(later)).toEqual(new Date('2026-11-14T15:00:00.000Z'));
  });

  it('reads the instant from the clock, never from the real time', () => {
    const y2030 = FixedClock.at('2030-01-01T00:00:00.000Z');

    expect(refreshTokenExpiresAt(y2030)).toEqual(new Date('2030-01-31T00:00:00.000Z'));
  });

  it('outlives the access token by a long way, which is the point of having both', () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBeGreaterThan(ACCESS_TOKEN_TTL_SECONDS);
  });
});

describe('hasExpired', () => {
  const expiry = new Date('2026-09-20T15:15:00.000Z');

  it('is not expired before the instant', () => {
    expect(hasExpired(expiry, FixedClock.at('2026-09-20T15:14:59.999Z'))).toBe(false);
  });

  // El borde cuenta como caducado: un token que vale "hasta las 15:15" no vale a las 15:15.
  it('is expired exactly at the instant', () => {
    expect(hasExpired(expiry, FixedClock.at('2026-09-20T15:15:00.000Z'))).toBe(true);
  });

  it('is expired after the instant', () => {
    expect(hasExpired(expiry, FixedClock.at('2026-09-20T15:15:00.001Z'))).toBe(true);
  });
});
