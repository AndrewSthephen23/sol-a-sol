import type { Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import { type Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import { countsAsSaving, type TransactionType } from '../transactions/transaction-policy.js';
import { type GoalMovement } from './goal-progress.js';

/**
 * Qué se puede configurar en una meta y qué aportes acepta, decidido con el autor el 2026-10-03
 * (`docs/modules/goals.md`).
 */

export interface GoalSettings {
  /** En la moneda de la meta: una sola, nunca se convierte (decisión 2). */
  target: Money;
  startDate: LocalDate;
  endDate: LocalDate;
}

/** Lo que hace falta saber de una transacción enlazada, como está hoy. */
export interface LinkedTransaction {
  type: TransactionType;
  amount: Money;
  date: LocalDate;
}

export type LinkedContributionState =
  'ACTIVE' | 'TRANSACTION_DELETED' | 'TRANSACTION_NOT_A_SAVING' | 'CURRENCY_MISMATCH';

export class GoalTargetNotPositiveError extends DomainError {
  readonly code = 'GOAL_TARGET_NOT_POSITIVE';

  constructor() {
    super('A savings goal needs a target above zero.');
  }
}

export class GoalEndNotAfterStartError extends DomainError {
  readonly code = 'GOAL_END_NOT_AFTER_START';

  constructor() {
    super('A savings goal must end after it starts.');
  }
}

export class GoalContributionAmountNotPositiveError extends DomainError {
  readonly code = 'GOAL_CONTRIBUTION_AMOUNT_NOT_POSITIVE';

  constructor() {
    super('A contribution or a withdrawal needs an amount above zero.');
  }
}

export class GoalCurrencyMismatchError extends DomainError {
  readonly code = 'GOAL_CURRENCY_MISMATCH';

  constructor(goal: Currency, got: Currency) {
    super(`The goal is in ${goal}: got ${got}.`);
  }
}

export class FutureGoalContributionError extends DomainError {
  readonly code = 'GOAL_CONTRIBUTION_DATE_IN_FUTURE';

  constructor(date: LocalDate) {
    super(`A contribution cannot be dated after today: got ${date.toString()}.`);
  }
}

export class GoalWithdrawalExceedsSavedError extends DomainError {
  readonly code = 'GOAL_WITHDRAWAL_EXCEEDS_SAVED';

  constructor() {
    super('A withdrawal cannot take out more than the goal has saved.');
  }
}

export class GoalTransactionNotASavingError extends DomainError {
  readonly code = 'GOAL_TRANSACTION_NOT_A_SAVING';

  constructor() {
    super('Only a saving or an investment transaction can be linked to a goal.');
  }
}

/**
 * La meta **como quedaría**: objetivo mayor que cero y el fin después del inicio. Las fechas son
 * libres y el inicio puede ser pasado (decisión 6).
 */
export function assertGoalSettings(settings: GoalSettings): void {
  if (!settings.target.isPositive()) throw new GoalTargetNotPositiveError();
  if (!settings.endDate.isAfter(settings.startDate)) throw new GoalEndNotAfterStartError();
}

/**
 * Un aporte o un retiro **manual**: monto positivo en la moneda de la meta y con fecha de hoy o
 * antes, como una transacción. Puede ser anterior al inicio de la meta: es plata ya ahorrada.
 */
export function assertGoalContribution(
  movement: GoalMovement,
  goalCurrency: Currency,
  today: LocalDate,
): void {
  if (!movement.amount.isPositive()) throw new GoalContributionAmountNotPositiveError();
  assertGoalCurrency(movement.amount.currency, goalCurrency);
  if (movement.date.isAfter(today)) throw new FutureGoalContributionError(movement.date);
}

/**
 * Lo ahorrado **con el cambio ya aplicado** (`computeGoalProgress`) no puede quedar negativo: no
 * se saca más de lo que hay (2026-10-03).
 */
export function assertWithdrawalCovered(savedAfter: Money): void {
  if (savedAfter.isNegative()) throw new GoalWithdrawalExceedsSavedError();
}

/**
 * Cómo está hoy un aporte enlazado, que **sigue** a su transacción (decisión 1). `transaction` es
 * `null` si se borró. Solo uno `ACTIVE` cuenta; los demás vuelven a contar si la transacción se
 * restaura o se corrige.
 */
export function linkedContributionState(
  transaction: LinkedTransaction | null,
  goalCurrency: Currency,
): LinkedContributionState {
  if (transaction === null) return 'TRANSACTION_DELETED';
  if (!countsAsSaving(transaction.type)) return 'TRANSACTION_NOT_A_SAVING';
  if (transaction.amount.currency !== goalCurrency) return 'CURRENCY_MISMATCH';
  return 'ACTIVE';
}

/** Para enlazar: una transacción de ahorro o inversión en la moneda de la meta. */
export function assertLinkableTransaction(
  transaction: LinkedTransaction,
  goalCurrency: Currency,
): void {
  if (!countsAsSaving(transaction.type)) throw new GoalTransactionNotASavingError();
  assertGoalCurrency(transaction.amount.currency, goalCurrency);
}

/** Un aporte enlazado toma la transacción **entera**, con su fecha (2026-10-03). */
export function linkedContribution(transaction: LinkedTransaction): GoalMovement {
  return { kind: 'CONTRIBUTION', amount: transaction.amount, date: transaction.date };
}

function assertGoalCurrency(currency: Currency, goalCurrency: Currency): void {
  if (currency !== goalCurrency) throw new GoalCurrencyMismatchError(goalCurrency, currency);
}
