import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import {
  AUTH_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
  rateLimitFrom,
  STRICT_RATE_LIMIT,
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

describe('StrictRateLimit', () => {
  const reflector = new Reflector();

  // Se marca el destino real de la petición, no su URL: una ruta con `..` puede parecer otra
  // cosa mirando el texto, pero acaba en el controller que le toca.
  it('marks the controller it decorates', () => {
    expect(reflector.get(STRICT_RATE_LIMIT, Strict)).toBe(true);
  });

  it('leaves the rest unmarked', () => {
    expect(reflector.get(STRICT_RATE_LIMIT, Ordinary)).toBeUndefined();
  });
});
