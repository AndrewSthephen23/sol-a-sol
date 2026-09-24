import type { Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';

/**
 * Con qué se paga o dónde entra la plata: una cuenta (ahorro, sueldo), una billetera (Yape,
 * Plin), una tarjeta de crédito o efectivo.
 */
export const PAYMENT_METHOD_KINDS = ['ACCOUNT', 'WALLET', 'CREDIT_CARD', 'CASH'] as const;

export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

/** Lo que las reglas miran de un método de pago. El alias no entra: basta con que no esté vacío. */
export interface PaymentMethodDetails {
  kind: PaymentMethodKind;
  institution: string | null;
  last4: string | null;
  currency: Currency | null;
}

/**
 * Cuatro dígitos ASCII, ni uno más. Sin `\d`, que en algunos motores acepta dígitos de otros
 * alfabetos, y sin recortar espacios: quien llama manda el valor tal cual.
 */
const LAST4 = /^[0-9]{4}$/;

/** Tipos que identifican una tarjeta o cuenta concreta; los demás no tienen "últimos 4". */
const KINDS_WITH_LAST4: readonly PaymentMethodKind[] = ['CREDIT_CARD', 'ACCOUNT'];

/** Tipos que guardan una sola moneda. La tarjeta puede ser bimoneda y el efectivo, de ambas. */
const KINDS_WITH_CURRENCY: readonly PaymentMethodKind[] = ['ACCOUNT', 'WALLET'];

export class InvalidLast4Error extends DomainError {
  readonly code = 'INVALID_LAST4';

  constructor() {
    super('The last digits of a card or account must be exactly 4 digits.');
  }
}

export class Last4RequiredError extends DomainError {
  readonly code = 'LAST4_REQUIRED';

  constructor() {
    super('A credit card needs its last 4 digits: they are how its notifications name it.');
  }
}

export class Last4NotAllowedError extends DomainError {
  readonly code = 'LAST4_NOT_ALLOWED';

  constructor(kind: PaymentMethodKind) {
    super(`A payment method of kind ${kind} does not have last 4 digits.`);
  }
}

export class PaymentMethodCurrencyRequiredError extends DomainError {
  readonly code = 'PAYMENT_METHOD_CURRENCY_REQUIRED';

  constructor(kind: PaymentMethodKind) {
    super(`A payment method of kind ${kind} needs a currency: it holds a single one.`);
  }
}

export class InstitutionNotAllowedError extends DomainError {
  readonly code = 'INSTITUTION_NOT_ALLOWED';

  constructor() {
    super('Cash has no bank or institution.');
  }
}

/**
 * Comprueba que los datos de un método de pago tengan sentido para su tipo.
 *
 * - **Últimos 4 dígitos:** exactamente cuatro. Un número más largo **se rechaza, no se
 *   recorta**: recortarlo en silencio sería aceptar que alguien mandó el número completo de su
 *   tarjeta. Obligatorios en una tarjeta de crédito, opcionales en una cuenta, y no existen en
 *   una billetera ni en el efectivo.
 * - **Moneda:** obligatoria en cuentas y billeteras, que guardan una sola. Una tarjeta bimoneda
 *   y el efectivo pueden dejarla vacía (= aceptan las dos).
 * - **Institución:** el efectivo no tiene banco.
 */
export function assertValidPaymentMethod(details: PaymentMethodDetails): void {
  const { kind, institution, last4, currency } = details;

  if (last4 !== null && !LAST4.test(last4)) throw new InvalidLast4Error();
  if (kind === 'CREDIT_CARD' && last4 === null) throw new Last4RequiredError();
  if (last4 !== null && !KINDS_WITH_LAST4.includes(kind)) throw new Last4NotAllowedError(kind);
  if (currency === null && KINDS_WITH_CURRENCY.includes(kind)) {
    throw new PaymentMethodCurrencyRequiredError(kind);
  }
  if (kind === 'CASH' && institution !== null) throw new InstitutionNotAllowedError();
}
