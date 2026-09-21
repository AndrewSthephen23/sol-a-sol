import { FixedClock, TOTP_PERIOD_SECONDS } from '@sol-a-sol/domain';
import { Secret, TOTP as Generator } from 'otpauth';
import { describe, expect, it } from 'vitest';

import { OtpAuthTotp } from './otpauth-totp.js';

const NOW = '2026-09-21T12:00:00.000Z';
const CLOCK = FixedClock.at(NOW);

/** El código que mostraría la aplicación de autenticación en un instante dado. */
function codeAt(secret: string, offsetPeriods: number): string {
  const generator = new Generator({
    secret: Secret.fromBase32(secret),
    period: TOTP_PERIOD_SECONDS,
  });

  return generator.generate({
    timestamp: Date.parse(NOW) + offsetPeriods * TOTP_PERIOD_SECONDS * 1000,
  });
}

describe('OtpAuthTotp', () => {
  const totp = new OtpAuthTotp(CLOCK);

  describe('enrolling', () => {
    it('gives a secret and the URI an authenticator app scans', () => {
      const { secret, uri } = totp.enrol('ana@example.com');

      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(uri.startsWith('otpauth://totp/')).toBe(true);
    });

    it('names the account and the product, which is what the app shows', () => {
      const { uri } = totp.enrol('ana@example.com');

      expect(decodeURIComponent(uri)).toContain('ana@example.com');
      expect(decodeURIComponent(uri)).toContain('Sol a Sol');
    });

    it('never repeats a secret', () => {
      const secrets = new Set(
        Array.from({ length: 20 }, () => totp.enrol('ana@example.com').secret),
      );

      expect(secrets.size).toBe(20);
    });
  });

  describe('the tolerance window, checked with a fixed clock', () => {
    const { secret } = totp.enrol('ana@example.com');

    it('accepts the code of the current period', () => {
      expect(totp.verify(secret, codeAt(secret, 0))?.counter).toBe(
        Math.floor(Date.parse(NOW) / 1000 / TOTP_PERIOD_SECONDS),
      );
    });

    // Relojes ligeramente desfasados no deben impedir entrar.
    it('accepts the code of the previous period', () => {
      expect(totp.verify(secret, codeAt(secret, -1))).not.toBeNull();
    });

    it('accepts the code of the next period', () => {
      expect(totp.verify(secret, codeAt(secret, 1))).not.toBeNull();
    });

    it('rejects a code from three periods ago', () => {
      expect(totp.verify(secret, codeAt(secret, -3))).toBeNull();
    });

    it('rejects a code from three periods ahead', () => {
      expect(totp.verify(secret, codeAt(secret, 3))).toBeNull();
    });

    it('reports which period the code belonged to, so it cannot serve twice', () => {
      const current = totp.verify(secret, codeAt(secret, 0))?.counter ?? 0;

      expect(totp.verify(secret, codeAt(secret, -1))?.counter).toBe(current - 1);
      expect(totp.verify(secret, codeAt(secret, 1))?.counter).toBe(current + 1);
    });
  });

  describe('refusing', () => {
    const { secret } = totp.enrol('ana@example.com');

    it('rejects a code that is not the right one', () => {
      expect(totp.verify(secret, '000000')).toBeNull();
    });

    it('rejects a code belonging to another secret', () => {
      const other = totp.enrol('otra@example.com');

      expect(totp.verify(secret, codeAt(other.secret, 0))).toBeNull();
    });
  });
});
