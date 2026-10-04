import { DomainError } from '../errors/domain-error.js';
import { Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import {
  assertTransactionAmount,
  assertTransactionDate,
  type TransactionType,
} from '../transactions/transaction-policy.js';
import { type CaptureAmount } from './capture-amount.js';
import { type CaptureStatus } from './capture-duplicates.js';

export class CaptureNotPendingError extends DomainError {
  readonly code = 'CAPTURE_NOT_PENDING';

  constructor() {
    super('The capture was already confirmed or discarded.');
  }
}

export class CaptureAmountMissingError extends DomainError {
  readonly code = 'CAPTURE_AMOUNT_MISSING';

  constructor() {
    super('The capture has no amount: write it before confirming.');
  }
}

export class CaptureCurrencyMissingError extends DomainError {
  readonly code = 'CAPTURE_CURRENCY_MISSING';

  constructor() {
    super('The capture has no currency: choose it before confirming.');
  }
}

export class CaptureCategoryMissingError extends DomainError {
  readonly code = 'CAPTURE_CATEGORY_MISSING';

  constructor() {
    super('The capture has no category: choose it before confirming.');
  }
}

export class CaptureDescriptionMissingError extends DomainError {
  readonly code = 'CAPTURE_DESCRIPTION_MISSING';

  constructor() {
    super('The capture has neither a description nor a merchant: write one before confirming.');
  }
}

/** Una captura como está en la bandeja, con lo que se corrigió. */
export interface CaptureToConfirm {
  status: CaptureStatus;
  source: 'IOS_SHORTCUT' | 'ANDROID_AUTOMATION';
  type: TransactionType;
  date: LocalDate;
  amount: CaptureAmount | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  merchant: string | null;
  description: string | null;
}

/** La transacción que sale de confirmar una captura. */
export interface TransactionFromCapture {
  type: TransactionType;
  date: LocalDate;
  amount: Money;
  categoryId: string;
  paymentMethodId: string | null;
  merchant: string | null;
  description: string;
  source: 'IOS_SHORTCUT' | 'ANDROID_AUTOMATION';
}

/**
 * La transacción que sale de una captura de la bandeja. Se confirma una pendiente o una
 * duplicada (decisión 6), con monto, moneda, categoría y descripción; sin descripción se usa el
 * comercio (decidido el 2026-10-04). Lo que falte se dice con su error, para que la bandeja lo
 * pida. La fecha sigue la regla de toda transacción: hasta hoy.
 *
 * Que la categoría sea del tipo de la captura y no esté archivada, y que el método no lo esté, lo
 * comprueba el caso de uso con el catálogo (`assertCategoryUsable`, `assertPaymentMethodUsable`).
 */
export function transactionFromCapture(
  capture: CaptureToConfirm,
  today: LocalDate,
): TransactionFromCapture {
  if (capture.status === 'CONFIRMED' || capture.status === 'DISCARDED') {
    throw new CaptureNotPendingError();
  }
  if (capture.amount === null) throw new CaptureAmountMissingError();
  if (capture.amount.currency === null) throw new CaptureCurrencyMissingError();
  if (capture.categoryId === null) throw new CaptureCategoryMissingError();
  const merchant = clean(capture.merchant);
  const description = clean(capture.description) ?? merchant;
  if (description === null) throw new CaptureDescriptionMissingError();

  const amount = Money.of(capture.amount.value, capture.amount.currency);
  assertTransactionAmount(amount);
  assertTransactionDate(capture.date, today);

  return {
    type: capture.type,
    date: capture.date,
    amount,
    categoryId: capture.categoryId,
    paymentMethodId: capture.paymentMethodId,
    merchant: capture.merchant,
    description,
    source: capture.source,
  };
}

function clean(text: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
