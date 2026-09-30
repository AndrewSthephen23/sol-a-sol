import { CURRENCIES, type Currency } from '../currency/currency.js';
import { Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import {
  type BillingCycle,
  computeBillingCycle,
  computePaymentDueDate,
  previousBillingCycle,
} from './billing-cycle.js';
import type { CreditCardSettings } from './credit-card-settings.js';
import {
  computeUtilization,
  type PaymentAlert,
  paymentAlert,
  type Utilization,
} from './utilization.js';

/**
 * Dónde está una tarjeta hoy: ciclo en curso, lo que se debe, utilización y el último estado de
 * cuenta cerrado, decidido con el autor el 2026-09-29 (`docs/modules/credit-cards.md`). Todo se
 * calcula con los movimientos: no hay saldos guardados.
 */

/** Una transacción con la tarjeta (por su tipo), o una transferencia que llega a ella o sale. */
export type CardMovementKind = TransactionType | 'TRANSFER_IN' | 'TRANSFER_OUT';

/** Lo que se movió con la tarjeta un día, de un tipo y en una moneda. */
export interface CardMovement {
  date: LocalDate;
  kind: CardMovementKind;
  amount: Money;
}

/** Sube la deuda (`CHARGE`) o la baja (`CREDIT`). */
export type CardMovementEffect = 'CHARGE' | 'CREDIT';

export interface CurrencyCardStatus {
  currency: Currency;
  /** Lo que se debe hoy: la deuda total (decisión 1). Negativa, es un saldo a favor. */
  debt: Money;
  /** Lo cargado en el ciclo en curso, sin descontar pagos. */
  cycleCharges: Money;
}

export interface StatementBalance {
  /** La deuda total el día del corte, con lo que quedó sin pagar de antes. */
  balance: Money;
  /** Lo que entró a la tarjeta después del corte: pagos y devoluciones. */
  credited: Money;
  /** Lo que falta pagar de ese estado; cero si ya se cubrió. */
  remaining: Money;
}

export interface StatementStatus {
  cycle: BillingCycle;
  dueDate: LocalDate;
  /** 0 el mismo día; negativo si ya venció. */
  daysLeft: number;
  /** Uno por moneda de la tarjeta, en el orden de `currencies`. */
  balances: StatementBalance[];
  /** Pagado cuando no falta nada en ninguna moneda (decisión 10). */
  paid: boolean;
}

export interface CardStatus {
  cycle: BillingCycle;
  /** Primero soles. Siempre la moneda de la línea; la otra, si tiene saldo inicial o movimientos. */
  currencies: CurrencyCardStatus[];
  /**
   * El último estado cerrado. `null` si el saldo inicial es posterior a su corte: no se sabe
   * cuánto se debía ese día.
   */
  statement: StatementStatus | null;
  /** De la deuda en la moneda de la línea (decisión 3). */
  utilization: Utilization;
  paymentAlert: PaymentAlert | null;
}

export interface CardStatusRequest {
  settings: CreditCardSettings;
  /** Hasta hoy; los anteriores al saldo inicial se ignoran aquí mismo. */
  movements: readonly CardMovement[];
  today: LocalDate;
}

/**
 * Qué hace un movimiento con la deuda. Pagar la tarjeta (una transferencia que llega) y una
 * devolución (un ingreso con la tarjeta) la bajan; todo lo demás la sube, también sacar efectivo
 * de la tarjeta (una transferencia que sale) (2026-09-29).
 */
export function cardMovementEffect(kind: CardMovementKind): CardMovementEffect {
  return kind === 'INCOME' || kind === 'TRANSFER_IN' ? 'CREDIT' : 'CHARGE';
}

export function computeCardStatus({ settings, movements, today }: CardStatusRequest): CardStatus {
  const { creditLimit, openingBalance, statementDay } = settings;
  const cycle = computeBillingCycle(statementDay, today);
  const closed = previousBillingCycle(statementDay, cycle);
  // El saldo inicial es lo que se debía al terminar su día: cuenta solo lo posterior.
  const counted = movements.filter(
    (movement) => openingBalance === null || movement.date.isAfter(openingBalance.date),
  );
  const currencies = CURRENCIES.filter(
    (currency) =>
      currency === creditLimit.currency ||
      (openingBalance?.amounts.some((amount) => amount.currency === currency) ?? false) ||
      counted.some((movement) => movement.amount.currency === currency),
  );

  const openingIn = (currency: Currency) =>
    openingBalance?.amounts.find((amount) => amount.currency === currency) ?? Money.zero(currency);
  const debtUntil = (currency: Currency, last: LocalDate) =>
    counted
      .filter((movement) => movement.amount.currency === currency && !movement.date.isAfter(last))
      .reduce((total, movement) => total.add(signed(movement)), openingIn(currency));
  const sumOf = (currency: Currency, effect: CardMovementEffect, from: LocalDate) =>
    counted
      .filter(
        (movement) =>
          movement.amount.currency === currency &&
          cardMovementEffect(movement.kind) === effect &&
          !movement.date.isBefore(from),
      )
      .reduce((total, movement) => total.add(movement.amount), Money.zero(currency));

  const statuses = currencies.map((currency) => ({
    currency,
    debt: debtUntil(currency, today),
    cycleCharges: sumOf(currency, 'CHARGE', cycle.start),
  }));
  const statement =
    openingBalance?.date.isAfter(closed.end) === true
      ? null
      : statementOf(
          closed,
          computePaymentDueDate(closed.end, settings.paymentDueRule),
          today,
          currencies.map((currency) => {
            const balance = debtUntil(currency, closed.end);
            const credited = sumOf(currency, 'CREDIT', closed.end.plusDays(1));
            const left = balance.subtract(credited);

            return {
              balance,
              credited,
              remaining: left.isPositive() ? left : Money.zero(currency),
            };
          }),
        );
  const lineDebt = statuses.find((entry) => entry.currency === creditLimit.currency);

  return {
    cycle,
    currencies: statuses,
    statement,
    utilization: computeUtilization(
      creditLimit,
      lineDebt?.debt ?? Money.zero(creditLimit.currency),
    ),
    paymentAlert:
      statement === null
        ? null
        : (statement.balances
            .map((entry) => paymentAlert(today, statement.dueDate, entry.remaining))
            .find((alert) => alert !== null) ?? null),
  };
}

function statementOf(
  cycle: BillingCycle,
  dueDate: LocalDate,
  today: LocalDate,
  balances: StatementBalance[],
): StatementStatus {
  return {
    cycle,
    dueDate,
    daysLeft: today.daysUntil(dueDate),
    balances,
    paid: balances.every((entry) => entry.remaining.isZero()),
  };
}

function signed(movement: CardMovement): Money {
  return cardMovementEffect(movement.kind) === 'CHARGE'
    ? movement.amount
    : Money.zero(movement.amount.currency).subtract(movement.amount);
}
