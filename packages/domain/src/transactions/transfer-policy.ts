import type { Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import { Money } from '../money/money.js';
import { TransactionCurrencyRequiredError } from './transaction-policy.js';

/**
 * Una **transferencia** mueve plata de una cuenta propia a otra (del banco a Yape, de soles a
 * dólares, de la cuenta a la tarjeta). No es ingreso ni gasto: no cambia cuánto se tiene, solo
 * dónde está. Decidido con el autor el 2026-09-27.
 */

export class SameTransferAccountError extends DomainError {
  readonly code = 'TRANSFER_SAME_ACCOUNT';

  constructor() {
    super('A transfer cannot go from an account to the same account.');
  }
}

export class TransferCurrencyMismatchError extends DomainError {
  readonly code = 'TRANSFER_CURRENCY_MISMATCH';

  constructor(requested: Currency, account: Currency) {
    super(`Cannot move ${requested} through a ${account} account.`);
  }
}

export class TransferReceivedAmountRequiredError extends DomainError {
  readonly code = 'TRANSFER_RECEIVED_AMOUNT_REQUIRED';

  constructor() {
    super('The amount received is required when the currency changes: it is never converted.');
  }
}

export class TransferReceivedAmountMismatchError extends DomainError {
  readonly code = 'TRANSFER_RECEIVED_AMOUNT_MISMATCH';

  constructor() {
    super('In the same currency, the amount received must be the amount sent.');
  }
}

export class NonPositiveTransferAmountError extends DomainError {
  readonly code = 'TRANSFER_AMOUNT_NOT_POSITIVE';

  constructor() {
    super('A transfer amount must be greater than zero.');
  }
}

export function assertDistinctAccounts(fromId: string, toId: string): void {
  if (fromId === toId) throw new SameTransferAccountError();
}

/** Lo que las reglas miran de cada cuenta: su moneda, o `null` si acepta las dos. */
export interface TransferAccount {
  currency: Currency | null;
}

/** Los montos como llegan, en texto para no perder precisión. `null` = no se indicó. */
export interface TransferAmountsRequest {
  amount: string;
  currency: Currency | null;
  receivedAmount: string | null;
  receivedCurrency: Currency | null;
}

export interface TransferAmounts {
  sent: Money;
  received: Money;
}

/**
 * Lo que sale y lo que llega.
 *
 * - **La moneda la ponen las cuentas:** una cuenta en soles solo manda o recibe soles. Una que
 *   acepta las dos (efectivo, tarjeta bimoneda) toma la indicada; si no hay ninguna, la de salida
 *   se exige y la de llegada es la misma que salió.
 * - **En la misma moneda llega lo mismo que salió.**
 * - **Si la moneda cambia, se exigen los dos montos**, copiados del voucher. Nunca se calcula uno
 *   a partir del otro: el tipo de cambio lo pone el banco, y aquí solo se deriva.
 */
export function resolveTransferAmounts(
  request: TransferAmountsRequest,
  from: TransferAccount,
  to: TransferAccount,
): TransferAmounts {
  const sentCurrency = accountCurrency(request.currency, from);
  if (sentCurrency === null) throw new TransactionCurrencyRequiredError();
  const receivedCurrency = accountCurrency(request.receivedCurrency, to) ?? sentCurrency;

  const sent = positive(Money.of(request.amount, sentCurrency));
  if (receivedCurrency === sentCurrency) {
    if (
      request.receivedAmount !== null &&
      !Money.of(request.receivedAmount, sentCurrency).equals(sent)
    ) {
      throw new TransferReceivedAmountMismatchError();
    }

    return { sent, received: sent };
  }

  if (request.receivedAmount === null) throw new TransferReceivedAmountRequiredError();

  return { sent, received: positive(Money.of(request.receivedAmount, receivedCurrency)) };
}

/** La moneda de la cuenta si tiene una (y la indicada tiene que coincidir); si no, la indicada. */
function accountCurrency(requested: Currency | null, account: TransferAccount): Currency | null {
  if (account.currency === null) return requested;
  if (requested !== null && requested !== account.currency) {
    throw new TransferCurrencyMismatchError(requested, account.currency);
  }

  return account.currency;
}

function positive(amount: Money): Money {
  if (!amount.isPositive()) throw new NonPositiveTransferAmountError();

  return amount;
}
