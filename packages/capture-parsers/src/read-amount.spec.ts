import { describe, expect, it } from 'vitest';

import { readAmount } from './read-amount.js';

describe('readAmount', () => {
  it('finds the amount glued to its currency', () => {
    const { amount, warnings } = readAmount('Compra por S/ 1,234.50 en TIENDA');

    expect(amount?.toFixed()).toBe('1234.50');
    expect(amount?.currency).toBe('PEN');
    expect(warnings).toEqual([]);
  });

  it('reads a lone $ as dollars', () => {
    expect(readAmount('Consumo de $ 20.00').amount?.currency).toBe('USD');
  });

  it.each([
    ['there is none', 'Tienes una notificación nueva', 'AMOUNT_NOT_FOUND'],
    ['there are different ones', 'Pago de S/ 10.00 y comisión S/ 1.50', 'AMBIGUOUS_AMOUNT'],
    ['it has more than 2 decimals', 'Compra por S/ 25.905', 'INVALID_AMOUNT'],
  ])('gives no amount and a warning when %s', (_label, text, warning) => {
    expect(readAmount(text)).toEqual({ amount: null, warnings: [warning] });
  });
});
