import { describe, expect, it } from 'vitest';

import {
  AUTH_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
  isAuthPath,
  isHealthPath,
  rateLimitFrom,
} from './rate-limits.js';

const PREFIX = 'api/v1';

describe('rate limits', () => {
  it('is stricter on /auth than everywhere else', () => {
    expect(AUTH_RATE_LIMIT).toBeLessThan(DEFAULT_RATE_LIMIT);
  });

  it('takes the limit from the environment', () => {
    expect(rateLimitFrom('50', DEFAULT_RATE_LIMIT)).toBe(50);
  });

  // Un error de tipeo en una variable de entorno no puede dejar la API sin tope, ni con tope 0.
  it.each([
    ['nothing at all', undefined],
    ['empty text', ''],
    ['text that is not a number', 'mucho'],
    ['zero', '0'],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
  ])('falls back to the default with %s', (_case, value) => {
    expect(rateLimitFrom(value, DEFAULT_RATE_LIMIT)).toBe(DEFAULT_RATE_LIMIT);
  });
});

describe('isAuthPath', () => {
  it.each(['/api/v1/auth/login', '/api/v1/auth/2fa/verify', '/api/v1/auth/login?next=/inicio'])(
    'recognises %s',
    (url) => {
      expect(isAuthPath(url, PREFIX)).toBe(true);
    },
  );

  // Ni una ruta de otro módulo ni una que solo empiece igual llevan el tope estricto.
  it.each(['/api/v1/tokens', '/api/v1/authors', '/health', undefined])(
    'does not recognise %s',
    (url) => {
      expect(isAuthPath(url, PREFIX)).toBe(false);
    },
  );
});

describe('isHealthPath', () => {
  it.each(['/health', '/health/ready'])('recognises %s', (url) => {
    expect(isHealthPath(url)).toBe(true);
  });

  it.each(['/api/v1/auth/login', '/healthy', undefined])('does not recognise %s', (url) => {
    expect(isHealthPath(url)).toBe(false);
  });
});
