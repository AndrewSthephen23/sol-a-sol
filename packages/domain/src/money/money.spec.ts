import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { InvalidCurrencyError } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import {
  CurrencyMismatchError,
  InvalidAllocationError,
  InvalidAmountError,
  Money,
  roundPercentage,
} from './money.js';

const pen = (amount: string): Money => Money.of(amount, 'PEN');
const fixed = (monies: Money[]): string[] => monies.map((money) => money.toFixed());

describe('Money', () => {
  describe('of', () => {
    it.each([
      ['1234.50', '1234.50'],
      ['1234.5', '1234.50'],
      ['100', '100.00'],
      ['0', '0.00'],
      ['-50.5', '-50.50'],
    ])('creates %s as %s', (input, expected) => {
      const money = pen(input);

      expect(money.toFixed()).toBe(expected);
      expect(money.currency).toBe('PEN');
    });

    // decimal.js descarta los ceros finales: Decimal('12.30') tiene 1 decimal, no 2.
    it.each([
      ['12.34', '12.34'],
      ['12.30', '12.30'],
      ['12', '12.00'],
    ])('accepts a Decimal %s with at most two decimal places', (input, expected) => {
      expect(Money.of(new Decimal(input), 'USD').toFixed()).toBe(expected);
    });

    it('normalizes negative zero to zero', () => {
      const money = pen('-0');

      expect(money.isNegative()).toBe(false);
      expect(money.toFixed()).toBe('0.00');
    });

    it.each([
      ['more than two decimals', '12.345'],
      ['thousands separators', '1,234.50'],
      ['a currency symbol', 'S/ 10'],
      ['exponent notation', '1e3'],
      ['a trailing dot', '12.'],
      ['a leading dot', '.5'],
      ['surrounding spaces', ' 12'],
      ['an empty string', ''],
      ['text', 'abc'],
    ])('rejects %s', (_description, input) => {
      expect(() => pen(input)).toThrow(InvalidAmountError);
    });

    it.each([
      ['more than two decimals', new Decimal('1.234')],
      ['NaN', new Decimal(Number.NaN)],
      ['Infinity', new Decimal(Number.POSITIVE_INFINITY)],
    ])('rejects a Decimal with %s', (_description, input) => {
      expect(() => Money.of(input, 'PEN')).toThrow(InvalidAmountError);
    });

    it('rejects values that are neither strings nor Decimals', () => {
      expect(() => Money.of(10 as never, 'PEN')).toThrow(InvalidAmountError);
    });

    it('reports the rejected amount with a stable code', () => {
      const error = capture(() => pen('12.345'));

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        name: 'InvalidAmountError',
        code: 'INVALID_AMOUNT',
        value: '12.345',
        message: 'Invalid amount: "12.345"',
      });
    });

    it('rejects an unsupported currency coming from untrusted input', () => {
      expect(() => Money.of('10', 'EUR' as never)).toThrow(InvalidCurrencyError);
    });
  });

  describe('zero', () => {
    it('creates zero in the given currency', () => {
      const zero = Money.zero('USD');

      expect(zero.toFixed()).toBe('0.00');
      expect(zero.currency).toBe('USD');
      expect(zero.isZero()).toBe(true);
    });

    it('rejects an unsupported currency', () => {
      expect(() => Money.zero('EUR' as never)).toThrow(InvalidCurrencyError);
    });
  });

  describe('add and subtract', () => {
    it('adds without floating point errors', () => {
      expect(pen('0.10').add(pen('0.20')).equals(pen('0.30'))).toBe(true);
    });

    it('subtracts and allows a negative result', () => {
      expect(pen('500').subtract(pen('550')).equals(pen('-50'))).toBe(true);
    });

    it('does not modify the operands', () => {
      const original = pen('10');

      original.add(pen('5'));
      original.subtract(pen('5'));

      expect(original.toFixed()).toBe('10.00');
    });

    it.each(['add', 'subtract'] as const)(
      '%s rejects amounts in different currencies',
      (operation) => {
        const error = capture(() => pen('10')[operation](Money.of('10', 'USD')));

        expect(error).toBeInstanceOf(CurrencyMismatchError);
        expect(error).toMatchObject({
          code: 'CURRENCY_MISMATCH',
          left: 'PEN',
          right: 'USD',
          message: 'Cannot operate PEN with USD',
        });
      },
    );
  });

  describe('multiply', () => {
    it('multiplies by a decimal factor', () => {
      expect(pen('10.00').multiply('0.18').equals(pen('1.80'))).toBe(true);
    });

    it('accepts an integer factor with several digits', () => {
      expect(pen('2.50').multiply('12').equals(pen('30'))).toBe(true);
    });

    it('accepts a Decimal factor', () => {
      expect(pen('3').multiply(new Decimal('1.5')).equals(pen('4.50'))).toBe(true);
    });

    it('keeps full precision until the amount is rounded', () => {
      expect(pen('10.01').multiply('0.5').amount.toString()).toBe('5.005');
    });

    it('does not lose precision on large amounts', () => {
      expect(pen('9999999999999999.99').multiply('1.123456789').amount.toString()).toBe(
        '11234567889999999.98876543211',
      );
    });

    it.each([
      ['text', 'abc'],
      ['an empty string', ''],
      ['Infinity', 'Infinity'],
      ['exponent notation', '1e3'],
      ['an infinite Decimal', new Decimal(Number.POSITIVE_INFINITY)],
      ['a number', 2 as never],
    ])('rejects %s as factor', (_description, factor) => {
      expect(() => pen('1').multiply(factor)).toThrow(InvalidAmountError);
    });
  });

  describe('toFixed', () => {
    it.each([
      ['5.005', '5.00'],
      ['5.015', '5.02'],
      ['5.025', '5.02'],
      ['-5.005', '-5.00'],
      ['5.0051', '5.01'],
    ])('rounds %s half to even as %s', (amount, expected) => {
      expect(pen('1').multiply(amount).toFixed()).toBe(expected);
    });
  });

  describe('percentageOf', () => {
    it('returns the percentage this amount represents of a total', () => {
      expect(pen('1800').percentageOf(pen('5000'))?.toString()).toBe('36');
    });

    it('keeps full precision', () => {
      expect(pen('1').percentageOf(pen('3'))?.toFixed(10)).toBe('33.3333333333');
    });

    it('returns null when the total is zero instead of dividing by zero', () => {
      expect(pen('10').percentageOf(Money.zero('PEN'))).toBeNull();
    });

    it('rejects a total in a different currency', () => {
      expect(() => pen('1').percentageOf(Money.of('3', 'USD'))).toThrow(CurrencyMismatchError);
    });
  });

  describe('roundPercentage', () => {
    it.each([
      ['33.33333', '33.33'],
      ['36.665', '36.66'],
      ['36.675', '36.68'],
      ['36', '36'],
    ])('rounds %s half to even with two decimals as %s', (value, expected) => {
      expect(roundPercentage(new Decimal(value)).toString()).toBe(expected);
    });
  });

  describe('allocate', () => {
    it.each([
      ['100.00', 3, ['33.34', '33.33', '33.33']],
      ['100.00', 4, ['25.00', '25.00', '25.00', '25.00']],
      ['0.05', 3, ['0.02', '0.02', '0.01']],
      ['0.02', 3, ['0.01', '0.01', '0.00']],
      ['-100.00', 3, ['-33.34', '-33.33', '-33.33']],
      ['-0.02', 3, ['-0.01', '-0.01', '0.00']],
      ['10.00', 1, ['10.00']],
    ])('splits %s into %i parts as %j, extra cents first', (amount, parts, expected) => {
      const shares = pen(amount).allocate(parts);

      expect(fixed(shares)).toEqual(expected);
      expect(shares.every((share) => share.currency === 'PEN')).toBe(true);
      expect(
        shares.reduce((sum, share) => sum.add(share), Money.zero('PEN')).equals(pen(amount)),
      ).toBe(true);
    });

    it('rounds an amount with extra precision to cents before splitting', () => {
      expect(fixed(pen('10.01').multiply('0.5').allocate(2))).toEqual(['2.50', '2.50']);
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects %s parts', (parts) => {
      const error = capture(() => pen('10').allocate(parts));

      expect(error).toBeInstanceOf(InvalidAllocationError);
      expect(error).toMatchObject({
        code: 'INVALID_ALLOCATION',
        parts,
        message: `Cannot allocate into ${String(parts)} parts`,
      });
    });
  });

  describe('comparisons', () => {
    it('treats amounts with different scale as equal', () => {
      expect(pen('10.5').equals(pen('10.50'))).toBe(true);
    });

    it('is not equal to a different amount or currency', () => {
      expect(pen('10').equals(pen('10.01'))).toBe(false);
      expect(pen('10').equals(Money.of('10', 'USD'))).toBe(false);
    });

    it.each([
      ['-1', { zero: false, negative: true, positive: false }],
      ['0', { zero: true, negative: false, positive: false }],
      ['1', { zero: false, negative: false, positive: true }],
    ])('classifies %s', (amount, expected) => {
      const money = pen(amount);

      expect({
        zero: money.isZero(),
        negative: money.isNegative(),
        positive: money.isPositive(),
      }).toEqual(expected);
    });
  });
});

function capture(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Expected a DomainError to be thrown');
}
