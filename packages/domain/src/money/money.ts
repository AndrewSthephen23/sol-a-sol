import { Decimal } from 'decimal.js';

import { type Currency, toCurrency } from '../currency/currency.js';
import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';

/**
 * decimal.js propio del dominio: 40 dígitos significativos (la precisión por defecto, 20,
 * redondearía en silencio multiplicaciones sobre montos grandes) y redondeo bancario.
 */
const DomainDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

/** Céntimos: los montos de entrada y los valores presentados o persistidos tienen 2 decimales. */
const CENT_DECIMAL_PLACES = 2;
const CENTS_PER_UNIT = 100;
const PERCENT = 100;

/** Decimales con los que se muestran los porcentajes (36.67 %). */
export const PERCENTAGE_DECIMAL_PLACES = 2;

/** Monto de entrada: dígitos, signo opcional y hasta 2 decimales. Sin separadores ni exponentes. */
const AMOUNT_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
/** Factor de multiplicación: decimal sin límite de decimales. Sin separadores ni exponentes. */
const FACTOR_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Valor decimal aceptado por el dominio. Nunca `number`: pierde precisión. */
export type DecimalInput = string | Decimal;

export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  constructor(readonly value: unknown) {
    super(`Invalid amount: ${describeValue(value)}`);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(
    readonly left: Currency,
    readonly right: Currency,
  ) {
    super(`Cannot operate ${left} with ${right}`);
  }
}

export class InvalidAllocationError extends DomainError {
  readonly code = 'INVALID_ALLOCATION';

  constructor(readonly parts: number) {
    super(`Cannot allocate into ${String(parts)} parts`);
  }
}

/**
 * Monto de dinero en una moneda. Inmutable.
 *
 * - Guarda toda la precisión de los cálculos; solo se redondea (bancario, a céntimos) al
 *   presentar o persistir con `toFixed()`, o al repartir con `allocate()`.
 * - Admite negativos para diferencias y saldos. La regla "montos siempre positivos" pertenece
 *   a la transacción, no al dinero.
 * - Operar monedas distintas lanza `CurrencyMismatchError`.
 */
export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  /** Crea un monto a partir de un texto (`"1234.50"`) o un `Decimal` con hasta 2 decimales. */
  static of(amount: DecimalInput, currency: Currency): Money {
    return new Money(normalize(parseAmount(amount)), toCurrency(currency));
  }

  static zero(currency: Currency): Money {
    return new Money(new DomainDecimal(0), toCurrency(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return this.withAmount(this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return this.withAmount(this.amount.minus(other.amount));
  }

  /** Multiplica por un factor (tasa, porcentaje en decimal, cantidad). Conserva la precisión. */
  multiply(factor: DecimalInput): Money {
    return this.withAmount(this.amount.times(parseFactor(factor)));
  }

  /**
   * Qué porcentaje de `total` representa este monto, sin redondear (ver `roundPercentage`).
   * Devuelve `null` si `total` es cero: el porcentaje no está definido.
   */
  percentageOf(total: Money): Decimal | null {
    this.assertSameCurrency(total);
    if (total.amount.isZero()) {
      return null;
    }
    return this.amount.dividedBy(total.amount).times(PERCENT);
  }

  /**
   * Reparte el monto en `parts` partes iguales sin perder céntimos. Primero redondea a céntimos;
   * los céntimos que sobran se asignan de uno en uno a las primeras partes
   * (S/ 100.00 en 3 → 33.34, 33.33, 33.33).
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) {
      throw new InvalidAllocationError(parts);
    }
    const cents = this.amount.toDecimalPlaces(CENT_DECIMAL_PLACES).times(CENTS_PER_UNIT);
    const baseCents = cents.dividedBy(parts).truncated();
    const remainderCents = cents.minus(baseCents.times(parts));
    const extraCent = remainderCents.isNegative() ? -1 : 1;

    return Array.from({ length: parts }, (_, index) => {
      const shareCents = remainderCents.abs().greaterThan(index)
        ? baseCents.plus(extraCent)
        : baseCents;
      return this.withAmount(shareCents.dividedBy(CENTS_PER_UNIT));
    });
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.lessThan(0);
  }

  isPositive(): boolean {
    return this.amount.greaterThan(0);
  }

  /** Monto con 2 decimales y redondeo bancario, para presentar o persistir (`"1234.50"`). */
  toFixed(): string {
    return this.amount.toFixed(CENT_DECIMAL_PLACES);
  }

  private withAmount(amount: Decimal): Money {
    return new Money(normalize(amount), this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

/** Redondea un porcentaje a `PERCENTAGE_DECIMAL_PLACES` decimales con redondeo bancario. */
export function roundPercentage(value: Decimal): Decimal {
  return new DomainDecimal(value).toDecimalPlaces(PERCENTAGE_DECIMAL_PLACES);
}

function parseAmount(value: unknown): Decimal {
  if (Decimal.isDecimal(value)) {
    if (value.isFinite() && value.decimalPlaces() <= CENT_DECIMAL_PLACES) {
      return new DomainDecimal(value);
    }
  } else if (typeof value === 'string' && AMOUNT_PATTERN.test(value)) {
    return new DomainDecimal(value);
  }
  throw new InvalidAmountError(value);
}

function parseFactor(value: unknown): Decimal {
  if (Decimal.isDecimal(value)) {
    if (value.isFinite()) {
      return new DomainDecimal(value);
    }
  } else if (typeof value === 'string' && FACTOR_PATTERN.test(value)) {
    return new DomainDecimal(value);
  }
  throw new InvalidAmountError(value);
}

/** Evita el cero negativo (`-0`), que se mostraría como `"-0.00"`. */
function normalize(amount: Decimal): Decimal {
  return amount.isZero() ? new DomainDecimal(0) : amount;
}
