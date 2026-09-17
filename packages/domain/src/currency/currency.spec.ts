import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain-error.js';
import { CURRENCIES, InvalidCurrencyError, isCurrency, toCurrency } from './currency.js';

describe('currency', () => {
  it('supports exactly PEN and USD', () => {
    expect(CURRENCIES).toEqual(['PEN', 'USD']);
  });

  describe('isCurrency', () => {
    it.each(['PEN', 'USD'])('accepts %s', (code) => {
      expect(isCurrency(code)).toBe(true);
    });

    it.each([
      ['a lowercase code', 'pen'],
      ['an unsupported ISO code', 'EUR'],
      ['a symbol', 'S/'],
      ['a padded code', ' PEN'],
      ['an empty string', ''],
      ['undefined', undefined],
      ['null', null],
      ['a number', 604],
      ['an object', { code: 'PEN' }],
    ])('rejects %s', (_description, value) => {
      expect(isCurrency(value)).toBe(false);
    });
  });

  describe('toCurrency', () => {
    it('returns the same code when it is supported', () => {
      expect(toCurrency('USD')).toBe('USD');
    });

    it('throws InvalidCurrencyError for an unsupported value', () => {
      expect(() => toCurrency('EUR')).toThrow(InvalidCurrencyError);
    });

    it('exposes a stable code, the rejected value and a descriptive message', () => {
      const error = captureError(() => toCurrency('EUR'));

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: 'InvalidCurrencyError',
        code: 'INVALID_CURRENCY',
        value: 'EUR',
        message: 'Unsupported currency: "EUR"',
      });
    });

    it('describes non-string values in the message', () => {
      expect(captureError(() => toCurrency(undefined)).message).toBe(
        'Unsupported currency: undefined',
      );
    });

    it('describes object values with String() instead of serializing them', () => {
      expect(captureError(() => toCurrency({ code: 'PEN' })).message).toBe(
        'Unsupported currency: [object Object]',
      );
    });
  });
});

function captureError(action: () => unknown): InvalidCurrencyError {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidCurrencyError) return error;
    throw error;
  }
  throw new Error('Expected InvalidCurrencyError to be thrown');
}
