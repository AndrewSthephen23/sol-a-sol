import { ACCESS_TOKEN_TTL_SECONDS, FixedClock } from '@sol-a-sol/domain';
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JoseAccessTokenIssuer } from './jose-access-token-issuer.js';

// Treinta y dos caracteres, obviamente falsos: no es una clave real de ningún entorno.
const SECRET = 'clave-de-prueba-no-real-0123456789';
const CLOCK = FixedClock.at('2026-09-20T15:00:00.000Z');
const USER_ID = '01999999-9999-7999-8999-999999999999';

describe('JoseAccessTokenIssuer', () => {
  let issuer: JoseAccessTokenIssuer;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = SECRET;
    issuer = new JoseAccessTokenIssuer(CLOCK);
  });

  afterEach(() => {
    delete process.env.AUTH_JWT_SECRET;
  });

  it('signs with HS256', async () => {
    const { token } = await issuer.issue(USER_ID);

    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'HS256', typ: 'JWT' });
  });

  it('verifies against the configured secret', async () => {
    const { token } = await issuer.issue(USER_ID);

    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      currentDate: CLOCK.now(),
    });
    expect(payload.sub).toBe(USER_ID);
  });

  it('does not verify against a different secret', async () => {
    const { token } = await issuer.issue(USER_ID);
    const other = new TextEncoder().encode('otra-clave-distinta-0123456789012');

    await expect(jwtVerify(token, other, { currentDate: CLOCK.now() })).rejects.toThrow();
  });

  // Un JWT va firmado pero no cifrado: cualquiera que lo intercepte lee su contenido.
  it('carries who it is about and nothing personal', async () => {
    const { token } = await issuer.issue(USER_ID);

    expect(Object.keys(decodeJwt(token)).toSorted()).toEqual(['exp', 'iat', 'sub']);
  });

  describe('expiry', () => {
    it('lasts what the domain says, counted from the clock', async () => {
      const { token, expiresInSeconds } = await issuer.issue(USER_ID);
      const { iat, exp } = decodeJwt(token);

      expect(iat).toBe(Math.floor(CLOCK.now().getTime() / 1000));
      expect(exp).toBe((iat ?? 0) + ACCESS_TOKEN_TTL_SECONDS);
      expect(expiresInSeconds).toBe(ACCESS_TOKEN_TTL_SECONDS);
    });

    it('is already expired a second after its lifetime, with no waiting involved', async () => {
      const { token } = await issuer.issue(USER_ID);
      const key = new TextEncoder().encode(SECRET);
      const justAfter = new Date(CLOCK.now().getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);

      await expect(jwtVerify(token, key, { currentDate: justAfter })).rejects.toThrow(/exp/i);
    });

    it('is still valid just before it runs out', async () => {
      const { token } = await issuer.issue(USER_ID);
      const key = new TextEncoder().encode(SECRET);
      const justBefore = new Date(CLOCK.now().getTime() + (ACCESS_TOKEN_TTL_SECONDS - 1) * 1000);

      await expect(jwtVerify(token, key, { currentDate: justBefore })).resolves.toBeDefined();
    });
  });

  describe('the signing secret', () => {
    it('refuses to sign without one', async () => {
      delete process.env.AUTH_JWT_SECRET;

      await expect(issuer.issue(USER_ID)).rejects.toThrow('AUTH_JWT_SECRET is not set');
    });

    it('refuses to sign with an empty one', async () => {
      process.env.AUTH_JWT_SECRET = '';

      await expect(issuer.issue(USER_ID)).rejects.toThrow('AUTH_JWT_SECRET is not set');
    });

    it('refuses a secret too short for HS256', async () => {
      process.env.AUTH_JWT_SECRET = 'corta';

      await expect(issuer.issue(USER_ID)).rejects.toThrow(/at least 32 bytes/);
    });

    it('never puts the secret in the error', async () => {
      process.env.AUTH_JWT_SECRET = 'corta';

      const error = await issuer.issue(USER_ID).catch((thrown: unknown) => thrown);
      expect((error as Error).message).not.toContain('corta');
    });
  });
});
