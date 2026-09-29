import { describe, expect, it } from 'vitest';

import { readAmount } from './amount-input';

describe('readAmount', () => {
  it.each([
    ['25.9', '25.90'],
    ['25', '25.00'],
    [' 1,234.50 ', '1234.50'],
    ['S/ 12.30', '12.30'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('reads %j as %s', (text, amount) => {
    expect(readAmount(text, 'PEN')).toEqual({ amount });
  });

  it.each([
    ['nothing', '', 'Escribe el monto.'],
    ['a third decimal, never rounded', '25.905', 'hasta 2 decimales'],
    ['a decimal comma, which is ambiguous', '1.234,50', 'punto decimal'],
    ['letters', 'veinte', 'punto decimal'],
    ['zero', '0', 'mayor que cero'],
    ['a negative amount', '-5', 'mayor que cero'],
    ['another currency than the chosen one', 'US$ 20', 'en dólares, no en soles'],
  ])('rejects %s', (_case, text, message) => {
    const check = readAmount(text, 'PEN');

    expect(check).toHaveProperty('error');
    expect((check as { error: string }).error).toContain(message);
  });

  it('checks only the shape while no currency is chosen', () => {
    expect(readAmount('US$ 20', null)).toEqual({ amount: '20.00' });
    expect(readAmount('20', null)).toEqual({ amount: '20.00' });
  });
});
