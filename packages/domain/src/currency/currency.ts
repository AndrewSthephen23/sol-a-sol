import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';

/** Monedas soportadas: soles (principal) y dólares estadounidenses. Códigos ISO 4217. */
export const CURRENCIES = ['PEN', 'USD'] as const;

export type Currency = (typeof CURRENCIES)[number];

export class InvalidCurrencyError extends DomainError {
  readonly code = 'INVALID_CURRENCY';

  constructor(readonly value: unknown) {
    super(`Unsupported currency: ${describeValue(value)}`);
  }
}

/**
 * Indica si el valor es un código de moneda soportado.
 *
 * Es estricto a propósito: solo códigos exactos (`'PEN'`, `'USD'`). Normalizar lo que escribe
 * el usuario (`'pen'`, `'S/'`, `'US$'`) es responsabilidad de quien interpreta la entrada.
 */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Devuelve el código de moneda o lanza `InvalidCurrencyError` si no está soportado. */
export function toCurrency(value: unknown): Currency {
  if (!isCurrency(value)) {
    throw new InvalidCurrencyError(value);
  }
  return value;
}
