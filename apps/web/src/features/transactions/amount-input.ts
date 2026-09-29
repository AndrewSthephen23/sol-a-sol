import { parseAmount } from '@sol-a-sol/domain';

import type { Currency } from '@/shared/format/money';

export type AmountCheck = { amount: string } | { error: string };

const CURRENCY_NAMES: Readonly<Record<Currency, string>> = { PEN: 'soles', USD: 'dólares' };

/**
 * Lee el monto que se escribió en el formulario con las reglas del dominio (`parseAmount`):
 * punto decimal y coma de miles (`1,234.50`), a lo más 2 decimales —más no se redondea, se
 * rechaza— y `1.234,50` se rechaza por ambiguo. Devuelve el texto que se manda a la API
 * (`"1234.50"`), **sin pasar nunca por `number`**.
 *
 * Se puede escribir la moneda (`S/ 25`), pero tiene que coincidir con la elegida.
 */
export function readAmount(text: string, currency: Currency | null): AmountCheck {
  if (text.trim() === '') return { error: 'Escribe el monto.' };

  let money;
  try {
    // Sin moneda elegida todavía solo se revisa la forma del número: la moneda se pide aparte
    // y nunca se deduce de aquí.
    money = parseAmount(text, { defaultCurrency: currency ?? 'PEN' });
  } catch {
    return { error: 'Escribe el monto con punto decimal y hasta 2 decimales, como 25.90.' };
  }
  if (currency !== null && money.currency !== currency) {
    return {
      error: `El monto está en ${CURRENCY_NAMES[money.currency]}, no en ${CURRENCY_NAMES[currency]}.`,
    };
  }
  if (!money.isPositive()) return { error: 'El monto tiene que ser mayor que cero.' };

  return { amount: money.toFixed() };
}
