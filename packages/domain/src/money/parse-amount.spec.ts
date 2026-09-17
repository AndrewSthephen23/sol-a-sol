import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain-error.js';
import { Money } from './money.js';
import {
  AmbiguousAmountError,
  AmountNotFoundError,
  findAmountInText,
  InvalidAmountTextError,
  parseAmount,
} from './parse-amount.js';

describe('parseAmount', () => {
  it.each([
    ['S/ 1,234.50', '1234.50', 'PEN'],
    ['S/1234.50', '1234.50', 'PEN'],
    ['S/. 25.90', '25.90', 'PEN'],
    ['s/ 25.9', '25.90', 'PEN'],
    ['PEN 25.90', '25.90', 'PEN'],
    ['25.90 PEN', '25.90', 'PEN'],
    ['US$ 20', '20.00', 'USD'],
    ['US$20.00', '20.00', 'USD'],
    ['usd 1,000', '1000.00', 'USD'],
    ['$ 15.50', '15.50', 'USD'],
    ['20.00 US$', '20.00', 'USD'],
    ['-50.25', '-50.25', 'PEN'],
    ['1,234,567.89', '1234567.89', 'PEN'],
  ])('reads %j as %s %s', (text, expected, currency) => {
    const money = parseAmount(text, { defaultCurrency: 'PEN' });

    expect(money.toFixed()).toBe(expected);
    expect(money.currency).toBe(currency);
  });

  it('normalizes extra spaces and the non-breaking spaces of notifications', () => {
    // Explícito a propósito: un NBSP literal en el código es invisible y alguien podría "limpiarlo".
    const nonBreakingSpace = String.fromCharCode(0xa0);
    const text = `  S/${nonBreakingSpace} 25.90  `;

    expect(text).toContain(nonBreakingSpace);
    expect(parseAmount(text, { defaultCurrency: 'PEN' }).toFixed()).toBe('25.90');
  });

  it.each([
    ['US$ 20', 'PEN', 'USD'],
    ['S/. 25.90', 'USD', 'PEN'],
    ['PEN 25.90', 'USD', 'PEN'],
    ['25.90 USD', 'PEN', 'USD'],
  ] as const)(
    'prefers the currency in %j over the default %s',
    (text, defaultCurrency, expected) => {
      expect(parseAmount(text, { defaultCurrency }).currency).toBe(expected);
    },
  );

  it('falls back to the default currency when the text has none', () => {
    expect(parseAmount('25.90', { defaultCurrency: 'USD' }).currency).toBe('USD');
  });

  it('requires a default currency when the text has none', () => {
    const error = capture(() => parseAmount('25.90'));

    expect(error).toBeInstanceOf(InvalidAmountTextError);
    expect(error).toMatchObject({
      code: 'INVALID_AMOUNT_TEXT',
      text: '25.90',
      message: 'Cannot read an amount from: "25.90"',
    });
  });

  it.each([
    ['a decimal comma', '1.234,50'],
    ['a decimal comma without thousands', '25,90'],
    ['more than two decimals', 'S/ 25.905'],
    ['badly grouped thousands', 'S/ 1,23.50'],
    ['two currencies', 'S/ 20 USD'],
    ['surrounding text', 'Consumo de S/ 25.90 en TAMBO'],
    ['an unsupported currency', 'EUR 20.00'],
    ['only the currency', 'S/'],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['exponent notation', '1e3'],
    ['text', 'abc'],
  ])('rejects %s', (_description, text) => {
    expect(() => parseAmount(text, { defaultCurrency: 'PEN' })).toThrow(InvalidAmountTextError);
  });

  it('rejects a value that is not a string', () => {
    expect(() => parseAmount(25.9 as never, { defaultCurrency: 'PEN' })).toThrow(
      InvalidAmountTextError,
    );
  });
});

describe('findAmountInText', () => {
  it.each([
    ['Consumo de S/ 25.90 en TAMBO', '25.90', 'PEN'],
    ['Se realizó un consumo por US$ 20.00 en NETFLIX', '20.00', 'USD'],
    ['Yape! Enviaste S/50 a Juan Perez', '50.00', 'PEN'],
    ['Compra por S/ 1,234.50 en PLAZA VEA', '1234.50', 'PEN'],
    ['Tarjeta terminada en 1234: consumo de S/ 25.90', '25.90', 'PEN'],
    ['17/09/2026 20:35 - Pago de S/ 80.00', '80.00', 'PEN'],
    ['Compra en 3 cuotas de S/ 99.90 cada una', '99.90', 'PEN'],
    ['Consumo de $ 15.50 en UBER', '15.50', 'USD'],
  ])('finds the amount in %j', (text, expected, currency) => {
    const money = findAmountInText(text);

    expect(money.toFixed()).toBe(expected);
    expect(money.currency).toBe(currency);
  });

  it('ignores numbers without a currency, even before the amount', () => {
    const money = findAmountInText('Tarjeta 4557 **** 1234, 17/09, consumo de S/ 25.90');

    expect(money.toFixed()).toBe('25.90');
  });

  it('accepts the same amount repeated', () => {
    expect(findAmountInText('Consumo de S/ 25.90. Total: S/ 25.90').toFixed()).toBe('25.90');
  });

  it('does not guess when the text has different amounts', () => {
    const error = capture(() =>
      findAmountInText('Consumo de S/ 25.90. Saldo disponible: S/ 1,500.00'),
    );

    expect(error).toBeInstanceOf(AmbiguousAmountError);
    expect(error).toMatchObject({
      code: 'AMBIGUOUS_AMOUNT',
      message: 'Found different amounts: 25.90, 1500.00',
    });
  });

  it('reports when no amount with a currency is present', () => {
    const error = capture(() => findAmountInText('Tu clave fue cambiada el 17/09/2026'));

    expect(error).toBeInstanceOf(AmountNotFoundError);
    expect(error).toMatchObject({
      code: 'AMOUNT_NOT_FOUND',
      text: 'Tu clave fue cambiada el 17/09/2026',
      message: 'No amount with a currency found in: "Tu clave fue cambiada el 17/09/2026"',
    });
  });

  it('reports when the amount it found is not valid', () => {
    expect(() => findAmountInText('Consumo de S/ 25.905 en TAMBO')).toThrow(InvalidAmountTextError);
  });

  it('throws domain errors with a stable code', () => {
    expect(capture(() => findAmountInText('sin monto'))).toBeInstanceOf(DomainError);
  });

  it('returns a Money ready for calculations', () => {
    const money = findAmountInText('Consumo de S/ 25.90 en TAMBO');

    expect(money.add(Money.of('0.10', 'PEN')).toFixed()).toBe('26.00');
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
