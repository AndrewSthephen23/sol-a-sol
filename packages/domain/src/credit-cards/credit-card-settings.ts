import type { PaymentMethodKind } from '../catalog/payment-method-policy.js';
import type { Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import { type Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import { assertPaymentDueRule, assertStatementDay, type PaymentDueRule } from './billing-cycle.js';
import { NegativeCreditLimitError } from './utilization.js';

/**
 * Qué se puede configurar en una tarjeta de crédito, decidido con el autor el 2026-09-29
 * (`docs/modules/credit-cards.md`). Lo que la identifica (alias, banco, últimos 4) es el método de
 * pago de `catalog`; aquí va lo que el método no tiene.
 */

/** Lo que hace falta saber del método de pago para configurarlo como tarjeta. */
export interface CreditCardMethod {
  kind: PaymentMethodKind;
  archived: boolean;
}

/** Lo que ya se debía antes de registrar en la app, uno por moneda, desde una fecha (decisión 2). */
export interface OpeningBalance {
  date: LocalDate;
  amounts: readonly Money[];
}

export interface CreditCardSettings {
  /** Una sola línea, en una moneda (decisión 3). Cero se permite: una tarjeta adicional. */
  creditLimit: Money;
  statementDay: number;
  paymentDueRule: PaymentDueRule;
  openingBalance: OpeningBalance | null;
}

export class NotACreditCardError extends DomainError {
  readonly code = 'PAYMENT_METHOD_NOT_CREDIT_CARD';

  constructor() {
    super('Only a credit card payment method can be set up as a credit card.');
  }
}

/** Mismo código que en `transactions`: para quien llama es el mismo problema. */
export class CreditCardMethodArchivedError extends DomainError {
  readonly code = 'PAYMENT_METHOD_ARCHIVED';

  constructor() {
    super('The payment method is archived: restore it to set it up as a credit card.');
  }
}

export class CreditCardCurrencyNotAcceptedError extends DomainError {
  readonly code = 'CREDIT_CARD_CURRENCY_NOT_ACCEPTED';

  constructor(got: Currency, accepted: Currency) {
    super(`The card only accepts ${accepted}: got ${got}.`);
  }
}

export class EmptyOpeningBalanceError extends DomainError {
  readonly code = 'OPENING_BALANCE_EMPTY';

  constructor() {
    super('An opening balance needs an amount in at least one currency.');
  }
}

export class OpeningBalanceCurrencyRepeatedError extends DomainError {
  readonly code = 'OPENING_BALANCE_CURRENCY_REPEATED';

  constructor(currency: Currency) {
    super(`The opening balance has ${currency} twice.`);
  }
}

export class NegativeOpeningBalanceError extends DomainError {
  readonly code = 'OPENING_BALANCE_NEGATIVE';

  constructor() {
    super('An opening balance cannot be negative.');
  }
}

export class FutureOpeningBalanceError extends DomainError {
  readonly code = 'OPENING_BALANCE_DATE_IN_FUTURE';

  constructor() {
    super('The opening balance cannot be dated after today.');
  }
}

/**
 * Solo un método `CREDIT_CARD` **activo** se configura como tarjeta. Uno archivado conserva su
 * configuración y se puede seguir corrigiendo (2026-09-29), pero no se configura de nuevo.
 */
export function assertConfigurableMethod(method: CreditCardMethod): void {
  if (method.kind !== 'CREDIT_CARD') throw new NotACreditCardError();
  if (method.archived) throw new CreditCardMethodArchivedError();
}

/**
 * La configuración **como quedaría**, contra la moneda del método (`null` = bimoneda, acepta las
 * dos). El saldo inicial es cero o más, uno por moneda, y con fecha de hoy o antes: una fecha
 * futura no diría qué se debía antes de empezar a registrar.
 */
export function assertCreditCardSettings(
  settings: CreditCardSettings,
  methodCurrency: Currency | null,
  today: LocalDate,
): void {
  const { creditLimit, openingBalance } = settings;
  if (creditLimit.isNegative()) throw new NegativeCreditLimitError();
  assertAccepted(creditLimit.currency, methodCurrency);
  assertStatementDay(settings.statementDay);
  assertPaymentDueRule(settings.paymentDueRule);
  if (openingBalance !== null) assertOpeningBalance(openingBalance, methodCurrency, today);
}

function assertOpeningBalance(
  balance: OpeningBalance,
  methodCurrency: Currency | null,
  today: LocalDate,
): void {
  if (balance.amounts.length === 0) throw new EmptyOpeningBalanceError();
  if (balance.date.isAfter(today)) throw new FutureOpeningBalanceError();
  const seen = new Set<Currency>();
  for (const amount of balance.amounts) {
    if (seen.has(amount.currency)) throw new OpeningBalanceCurrencyRepeatedError(amount.currency);
    seen.add(amount.currency);
    if (amount.isNegative()) throw new NegativeOpeningBalanceError();
    assertAccepted(amount.currency, methodCurrency);
  }
}

function assertAccepted(currency: Currency, methodCurrency: Currency | null): void {
  if (methodCurrency !== null && currency !== methodCurrency) {
    throw new CreditCardCurrencyNotAcceptedError(currency, methodCurrency);
  }
}
