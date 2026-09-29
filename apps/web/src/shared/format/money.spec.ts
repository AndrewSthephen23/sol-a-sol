import { describe, expect, it } from 'vitest';

import { formatMoney } from './money';

describe('formatMoney', () => {
  it.each([
    ['25.90', 'PEN', 'S/ 25.90'],
    ['1234.50', 'PEN', 'S/ 1,234.50'],
    ['1234567.00', 'USD', 'US$ 1,234,567.00'],
    ['-50.00', 'PEN', '-S/ 50.00'],
    ['0.00', 'USD', 'US$ 0.00'],
    ['7', 'PEN', 'S/ 7.00'],
    ['7.5', 'PEN', 'S/ 7.50'],
  ] as const)('shows %s %s as %s', (amount, currency, expected) => {
    expect(formatMoney(amount, currency)).toBe(expected);
  });

  it('keeps every cent of an amount too large for a JavaScript number', () => {
    expect(formatMoney('9999999999999999.99', 'PEN')).toBe('S/ 9,999,999,999,999,999.99');
  });
});
