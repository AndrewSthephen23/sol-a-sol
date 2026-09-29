export type Currency = 'PEN' | 'USD';

/** Cómo se escribe cada moneda en Perú: los soles con `S/` y los dólares con `US$`. */
const SYMBOLS: Readonly<Record<Currency, string>> = { PEN: 'S/', USD: 'US$' };

/**
 * Un monto de la API (`"-1234.5"`) como se lee en pantalla (`-S/ 1,234.50`): coma de miles y
 * punto decimal, el formato peruano.
 *
 * Trabaja sobre el texto y **nunca pasa por `number`**: un monto grande perdería céntimos. La API
 * ya manda dos decimales; si llegan menos se completan, pero nunca se redondea aquí.
 */
export function formatMoney(amount: string, currency: Currency): string {
  const negative = amount.startsWith('-');
  const [integer = '0', decimals = ''] = (negative ? amount.slice(1) : amount).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');

  return `${negative ? '-' : ''}${SYMBOLS[currency]} ${grouped}.${decimals.padEnd(2, '0')}`;
}
