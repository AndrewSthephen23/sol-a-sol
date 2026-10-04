import { describe, expect, it } from 'vitest';

import { maskCardNumbers } from './mask-card-numbers.js';

describe('maskCardNumbers', () => {
  it('leaves a text without long numbers as it is', () => {
    const text = 'Compra por S/ 25.90 con tu tarjeta ****4242 el 17/09/2026, operación 12345678';

    expect(maskCardNumbers(text)).toEqual({ text, masked: false, last4: null });
  });

  it.each([
    ['16 digits together', '4111111111111111'],
    ['16 digits in groups of 4', '4111 1111 1111 1111'],
    ['16 digits with dashes', '4111-1111-1111-1111'],
    ['15 digits in the Amex shape', '3782 822463 11111'],
    ['13 digits', '4222222221111'],
    ['19 digits', '6011 0000 0000 0001 111'],
    ['a 20 digit CCI', '00219300123456781111'],
  ])('keeps only the last 4 of %s', (_label, number) => {
    expect(maskCardNumbers(`Pagaste con ${number}.`)).toEqual({
      text: 'Pagaste con ••••1111.',
      masked: true,
      last4: '1111',
    });
  });

  it.each([
    ['12 digits', '411111111111'],
    ['a phone number', '987 654 321'],
    ['groups shorter than 3 digits', '41 11 11 11 11 11 11 11'],
  ])('leaves %s alone', (_label, number) => {
    const text = `Referencia ${number}`;

    expect(maskCardNumbers(text).text).toBe(text);
  });

  it('does not join an amount or a date to the number', () => {
    expect(maskCardNumbers('4111 1111 1111 1111 S/ 25.90 17/09/2026').text).toBe(
      '••••1111 S/ 25.90 17/09/2026',
    );
  });

  it('masks a number glued to letters', () => {
    expect(maskCardNumbers('TARJ4111111111111111').text).toBe('TARJ••••1111');
  });

  it('masks every number and keeps their last 4 when they all agree', () => {
    expect(maskCardNumbers('4111111111111111 y 5500 0000 0000 1111')).toEqual({
      text: '••••1111 y ••••1111',
      masked: true,
      last4: '1111',
    });
  });

  it('masks every number but gives no last 4 when they disagree', () => {
    expect(maskCardNumbers('4111111111111111 y 5500000000004444')).toEqual({
      text: '••••1111 y ••••4444',
      masked: true,
      last4: null,
    });
  });
});
