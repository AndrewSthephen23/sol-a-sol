import { type Currency } from '../currency/currency.js';
import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';
import { Money } from './money.js';

/**
 * Símbolos y códigos de moneda que se reconocen. En Perú los soles se escriben `S/` (a veces
 * `S/.`), así que un `$` suelto se interpreta como dólares.
 */
const CURRENCY_BY_TOKEN = new Map<string, Currency>([
  ['S/', 'PEN'],
  ['S/.', 'PEN'],
  ['PEN', 'PEN'],
  ['US$', 'USD'],
  ['USD', 'USD'],
  ['$', 'USD'],
]);

/** `US$` antes que `$` para que el token más largo gane. */
const CURRENCY_TOKEN = String.raw`S/\.?|US\$|USD|PEN|\$`;
/**
 * Formato peruano: punto decimal y coma de miles en grupos de 3 (`1,234.50`).
 * `1.234,50` (coma decimal) no coincide: es ambiguo y se rechaza en vez de adivinar.
 */
const AMOUNT = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
/** En texto libre se capturan también los decimales de más, para rechazarlos con un error claro. */
const AMOUNT_IN_TEXT = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;

const STRICT_PATTERN = new RegExp(
  String.raw`^(?:(${CURRENCY_TOKEN})\s*)?(${AMOUNT})(?:\s*(${CURRENCY_TOKEN}))?$`,
  'i',
);
const TEXT_PATTERN = new RegExp(String.raw`(?:${CURRENCY_TOKEN})\s*(?:${AMOUNT_IN_TEXT})`, 'gi');

export interface ParseAmountOptions {
  /** Moneda que se usa cuando el texto no la indica. Sin ella, un texto sin moneda se rechaza. */
  defaultCurrency?: Currency;
}

export class InvalidAmountTextError extends DomainError {
  readonly code = 'INVALID_AMOUNT_TEXT';

  constructor(readonly text: unknown) {
    super(`Cannot read an amount from: ${describeValue(text)}`);
  }
}

export class AmountNotFoundError extends DomainError {
  readonly code = 'AMOUNT_NOT_FOUND';

  constructor(readonly text: string) {
    super(`No amount with a currency found in: ${describeValue(text)}`);
  }
}

export class AmbiguousAmountError extends DomainError {
  readonly code = 'AMBIGUOUS_AMOUNT';

  constructor(readonly amounts: readonly Money[]) {
    super(`Found different amounts: ${amounts.map((amount) => amount.toFixed()).join(', ')}`);
  }
}

/**
 * Interpreta un texto que **solo** contiene un monto: `"S/ 1,234.50"`, `"US$ 20"`, `"25.90"`.
 * Para un campo de formulario, una celda de CSV o el monto que envía un atajo del teléfono.
 *
 * Si el texto trae moneda, esa gana sobre `defaultCurrency`. Para extraer el monto de una
 * notificación completa, usar `findAmountInText`.
 */
export function parseAmount(text: string, options: ParseAmountOptions = {}): Money {
  if (typeof text !== 'string') {
    throw new InvalidAmountTextError(text);
  }
  // `trim` también elimina los espacios no separables de las notificaciones,
  // y los patrones admiten cualquier cantidad de espacios entre la moneda y el monto.
  const match = STRICT_PATTERN.exec(text.trim());
  if (match === null) {
    throw new InvalidAmountTextError(text);
  }

  const [, prefix, amount, suffix] = match;
  // La moneda va antes o después del monto, nunca en ambos lados ("S/ 20 USD" es contradictorio).
  if (amount === undefined || (prefix !== undefined && suffix !== undefined)) {
    throw new InvalidAmountTextError(text);
  }

  const token = prefix ?? suffix;
  const currency =
    token === undefined ? options.defaultCurrency : CURRENCY_BY_TOKEN.get(token.toUpperCase());
  if (currency === undefined) {
    throw new InvalidAmountTextError(text);
  }

  // El patrón ya garantiza el formato y como máximo 2 decimales, así que `Money.of` no falla aquí:
  // un texto como "S/ 25.905" no llega a este punto, lo rechaza el patrón.
  return Money.of(amount.replaceAll(',', ''), currency);
}

/**
 * Busca el monto dentro de un texto libre, como la notificación de un banco o de Yape.
 *
 * Solo considera montos **pegados a una moneda** (`S/ 25.90`, `US$ 20.00`): los números sueltos
 * —últimos dígitos de la tarjeta, fechas, número de cuotas— se ignoran. Si el texto tiene montos
 * distintos, no adivina: lanza `AmbiguousAmountError` para que la captura se revise a mano.
 */
export function findAmountInText(text: string): Money {
  const found: Money[] = [];

  for (const [matched] of text.matchAll(TEXT_PATTERN)) {
    const money = parseAmount(matched);
    if (!found.some((previous) => previous.equals(money))) {
      found.push(money);
    }
  }

  const [first] = found;
  if (first === undefined) {
    throw new AmountNotFoundError(text);
  }
  if (found.length > 1) {
    throw new AmbiguousAmountError(found);
  }
  return first;
}
