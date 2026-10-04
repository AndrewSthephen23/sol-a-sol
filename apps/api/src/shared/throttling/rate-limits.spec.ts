import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import {
  AUTH_RATE_LIMIT,
  CAPTURE_RATE_LIMIT,
  CaptureRateLimit,
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_BUCKET,
  rateLimitFrom,
  StrictRateLimit,
} from './rate-limits.js';

@Controller()
@StrictRateLimit()
class Strict {
  @Get()
  costly(): undefined {
    // Una ruta cara, como las de /auth.
    return undefined;
  }
}

@Controller()
@CaptureRateLimit()
class Captures {
  @Get()
  fromThePhone(): undefined {
    // La ruta a la que mandan capturas el atajo y la macro.
    return undefined;
  }
}

@Controller()
class Ordinary {
  @Get()
  cheap(): undefined {
    // Una ruta cualquiera.
    return undefined;
  }
}

describe('rate limits', () => {
  it('is stricter where every request costs a password hash', () => {
    expect(AUTH_RATE_LIMIT).toBeLessThan(DEFAULT_RATE_LIMIT);
  });

  it('lets a phone send 30 captures a minute (decision 15 of H7)', () => {
    expect(CAPTURE_RATE_LIMIT).toBe(30);
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

describe('rate limit buckets', () => {
  const reflector = new Reflector();

  // Se marca el destino real de la petición, no su URL: una ruta con `..` puede parecer otra
  // cosa mirando el texto, pero acaba en el controller que le toca.
  it('marks the controller it decorates', () => {
    expect(reflector.get(RATE_LIMIT_BUCKET, Strict)).toBe('auth');
    expect(reflector.get(RATE_LIMIT_BUCKET, Captures)).toBe('captures');
  });

  it('leaves the rest unmarked', () => {
    expect(reflector.get(RATE_LIMIT_BUCKET, Ordinary)).toBeUndefined();
  });
});
