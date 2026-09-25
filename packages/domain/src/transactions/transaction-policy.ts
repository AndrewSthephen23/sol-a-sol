import type { Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import type { Money } from '../money/money.js';
import type { LocalDate } from '../time/local-date.js';

/** Tipos de transacción (glosario). También clasifican las categorías. */
export const TRANSACTION_TYPES = [
  'INCOME',
  'FIXED_EXPENSE',
  'VARIABLE_EXPENSE',
  'SAVING',
  'INVESTMENT',
  'DEBT',
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** De dónde llegó una transacción: a mano, desde el celular o importada de un CSV. */
export const TRANSACTION_SOURCES = [
  'MANUAL',
  'IOS_SHORTCUT',
  'ANDROID_AUTOMATION',
  'IMPORT',
] as const;

export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

/**
 * Qué cuenta como **gasto** en el presupuesto y los resúmenes: solo el fijo y el variable. La
 * deuda (pagar un préstamo o la tarjeta) se muestra aparte. Decidido con el autor el 2026-09-24.
 */
const EXPENSE_TYPES: readonly TransactionType[] = ['FIXED_EXPENSE', 'VARIABLE_EXPENSE'];

/**
 * Qué cuenta como **ahorro** para la tasa de ahorro (ahorro / ingresos): el ahorro y la
 * inversión, porque las dos son plata que no se consume. Decidido con el autor el 2026-09-24.
 */
const SAVING_TYPES: readonly TransactionType[] = ['SAVING', 'INVESTMENT'];

export class NonPositiveTransactionAmountError extends DomainError {
  readonly code = 'TRANSACTION_AMOUNT_NOT_POSITIVE';

  constructor() {
    super('A transaction amount must be greater than zero: its type gives the sign.');
  }
}

export class FutureTransactionDateError extends DomainError {
  readonly code = 'TRANSACTION_DATE_IN_FUTURE';

  constructor(date: LocalDate) {
    super(`The transaction date ${date.toString()} is in the future.`);
  }
}

export class TransactionCurrencyRequiredError extends DomainError {
  readonly code = 'TRANSACTION_CURRENCY_REQUIRED';

  constructor() {
    super('The currency is required: the payment method does not have a single one.');
  }
}

export class CategoryTypeMismatchError extends DomainError {
  readonly code = 'CATEGORY_TYPE_MISMATCH';

  constructor(categoryType: TransactionType, transactionType: TransactionType) {
    super(`A ${categoryType} category cannot hold a ${transactionType} transaction.`);
  }
}

export class ArchivedCategoryError extends DomainError {
  readonly code = 'CATEGORY_ARCHIVED';

  constructor() {
    super('The category is archived: restore it to use it in new transactions.');
  }
}

export class ArchivedPaymentMethodError extends DomainError {
  readonly code = 'PAYMENT_METHOD_ARCHIVED';

  constructor() {
    super('The payment method is archived: restore it to use it in new transactions.');
  }
}

/**
 * Un monto de transacción **siempre es positivo**: el signo lo da el tipo. Un gasto de S/ 25 se
 * registra como 25; un cero no es un movimiento, y un negativo suele ser un signo duplicado.
 */
export function assertTransactionAmount(amount: Money): void {
  if (!amount.isPositive()) throw new NonPositiveTransactionAmountError();
}

/**
 * El monto con signo, para el **saldo del mes**: el ingreso suma, y todo lo demás (gastos,
 * ahorro, inversión y deuda) sale de lo disponible.
 */
export function signedAmount(type: TransactionType, amount: Money): Money {
  return type === 'INCOME' ? amount : amount.multiply('-1');
}

export function countsAsExpense(type: TransactionType): boolean {
  return EXPENSE_TYPES.includes(type);
}

export function countsAsSaving(type: TransactionType): boolean {
  return SAVING_TYPES.includes(type);
}

/**
 * Una transacción registra algo que **ya pasó**: hasta hoy, nunca después. Un pago programado se
 * registra el día que ocurre, para que un resumen no muestre plata que todavía no se movió.
 *
 * `today` lo calcula quien llama con su reloj, en la hora de Lima (`today(clock)`).
 */
export function assertTransactionDate(date: LocalDate, today: LocalDate): void {
  if (date.isAfter(today)) throw new FutureTransactionDateError(date);
}

/**
 * La moneda de una transacción: la que se indicó o, si no, la de su método de pago. **No supone
 * soles**: si ninguno la dice (tarjeta bimoneda, efectivo, sin método), se exige. Nunca convierte.
 */
export function resolveTransactionCurrency(
  requested: Currency | null,
  paymentMethodCurrency: Currency | null,
): Currency {
  const currency = requested ?? paymentMethodCurrency;
  if (currency === null) throw new TransactionCurrencyRequiredError();

  return currency;
}

/** Lo que las reglas miran de la categoría elegida. */
export interface CategoryForTransaction {
  type: TransactionType;
  archived: boolean;
}

/**
 * La categoría tiene que ser **del mismo tipo** que la transacción (un ingreso no va en una
 * categoría de gastos) y **no estar archivada**. Una archivada sigue en las transacciones viejas,
 * pero no se usa en las nuevas.
 */
export function assertCategoryUsable(
  category: CategoryForTransaction,
  transactionType: TransactionType,
): void {
  if (category.type !== transactionType) {
    throw new CategoryTypeMismatchError(category.type, transactionType);
  }
  if (category.archived) throw new ArchivedCategoryError();
}

/** Lo que las reglas miran del método de pago elegido. */
export interface PaymentMethodForTransaction {
  archived: boolean;
}

/**
 * Como con la categoría, un método de pago archivado (una tarjeta que se canceló) sigue en las
 * transacciones viejas, pero no se usa en las nuevas.
 */
export function assertPaymentMethodUsable(method: PaymentMethodForTransaction): void {
  if (method.archived) throw new ArchivedPaymentMethodError();
}
