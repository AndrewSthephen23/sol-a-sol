import assert from 'node:assert/strict';

import { defineParameterType } from '@cucumber/cucumber';
import { type Currency, LocalDate, type Money } from '@sol-a-sol/domain';

// Cómo se leen los datos de los escenarios, igual en todos los `.feature`.

/** `24/09/2026` → `2026-09-24`. Los escenarios usan el formato peruano; es su origen conocido. */
defineParameterType({
  name: 'fecha',
  regexp: /\d{2}\/\d{2}\/\d{4}/,
  transformer: (text: string) => LocalDate.parseDayFirst(text).toString(),
});

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface Month {
  year: number;
  month: number;
}

/** `septiembre de 2026` (o `setiembre`, como se dice en Perú) → `{ year: 2026, month: 9 }`. */
export function monthOf(text: string): Month {
  const match = /^([a-z]+) de (\d{4})$/u.exec(text);
  const name = match?.[1] === 'setiembre' ? 'septiembre' : match?.[1];
  const month = MONTHS.indexOf(name ?? '') + 1;
  if (match === null || month === 0) throw new Error(`Cannot read the month «${text}».`);

  return { year: Number(match[2]), month };
}

defineParameterType({
  name: 'mes',
  regexp:
    /(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de \d{4}/,
  transformer: monthOf,
});

export interface Amount {
  /** Tal como está escrito, sin comas de miles: un tercer decimal llega intacto al dominio. */
  amount: string;
  currency: Currency;
}

/**
 * `"S/ 1,234.50"` → `{ amount: '1234.50', currency: 'PEN' }`. No usa `parseAmount` a propósito:
 * ese rechaza un tercer decimal, y los escenarios necesitan que el caso de uso lo rechace.
 */
export function amountOf(text: string): Amount {
  const match = /^(S\/|US\$)\s*(-?[\d,]+(?:\.\d+)?)$/u.exec(text);
  if (match === null) throw new Error(`Cannot read the amount «${text}».`);
  const [, symbol, digits = ''] = match;

  return { amount: digits.replaceAll(',', ''), currency: symbol === 'S/' ? 'PEN' : 'USD' };
}

export function sameMoney(actual: Money, text: string): void {
  const expected = amountOf(text);
  assert.equal(`${actual.currency} ${actual.toFixed()}`, `${expected.currency} ${expected.amount}`);
}

/** Para los mensajes de una aserción: el mensaje de un error, o el valor tal cual. */
export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
}

/** `soles` o `dólares`, como lo dice un escenario. */
export function currencyNamed(name: string): Currency {
  if (name === 'soles') return 'PEN';
  if (name === 'dólares') return 'USD';
  throw new Error(`Unknown currency «${name}».`);
}
