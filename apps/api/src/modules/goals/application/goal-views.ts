import {
  computeGoalProgress,
  type GoalContributionKind,
  type GoalMovement,
  type GoalProgress,
  type LinkedContributionState,
  linkedContributionState,
  type LocalDate,
  Money,
} from '@sol-a-sol/domain';

import type { StoredGoalContribution } from '../ports/goal-contribution-repository.js';
import type { Goal } from '../ports/goal-repository.js';
import type { GoalTransaction, GoalTransactionsReader } from '../ports/transactions-reader.js';

/**
 * Un aporte como está hoy. Uno manual es siempre `ACTIVE`; uno enlazado lleva el monto y la fecha
 * de su transacción **hoy** y solo cuenta si sigue vigente, de ahorro o inversión y en la moneda
 * de la meta (2026-10-03).
 */
export interface GoalContributionView {
  contribution: StoredGoalContribution;
  state: LinkedContributionState;
  kind: GoalContributionKind;
  /** `null` si la transacción enlazada se borró. */
  amount: Money | null;
  date: LocalDate | null;
  transaction: GoalTransaction | null;
}

/** Una meta con su progreso, calculado al consultar. */
export interface GoalView {
  goal: Goal;
  progress: GoalProgress;
  contributions: GoalContributionView[];
}

/**
 * Las metas con sus aportes como están **hoy**: los enlazados se leen de su transacción, así que
 * corregirla o borrarla nunca deja la meta desviada.
 */
export async function resolveGoals(
  transactions: GoalTransactionsReader,
  userId: string,
  goals: readonly Goal[],
  contributions: readonly StoredGoalContribution[],
  day: LocalDate,
): Promise<GoalView[]> {
  const linked = await transactions.liveTransactions(
    userId,
    contributions.flatMap((contribution) =>
      contribution.source === 'TRANSACTION' ? [contribution.transactionId] : [],
    ),
  );
  const byId = new Map(linked.map((transaction) => [transaction.id, transaction]));

  return goals.map((goal) => {
    const views = contributions
      .filter((contribution) => contribution.goalId === goal.id)
      .map((contribution) => contributionView(goal, contribution, byId));

    return { goal, contributions: views, progress: progressOf(goal, views, day) };
  });
}

/** El progreso con los aportes que cuentan y, si hace falta, un movimiento que todavía no existe. */
export function progressOf(
  goal: Goal,
  views: readonly GoalContributionView[],
  day: LocalDate,
  extra: readonly GoalMovement[] = [],
): GoalProgress {
  return computeGoalProgress({
    target: goal.target,
    startDate: goal.startDate,
    endDate: goal.endDate,
    contributions: [...views.flatMap(movementOf), ...extra],
    today: day,
  });
}

/** Lo que el aporte suma o resta hoy; nada si no cuenta. */
export function movementOf(view: GoalContributionView): GoalMovement[] {
  return view.state === 'ACTIVE' && view.amount !== null && view.date !== null
    ? [{ kind: view.kind, amount: view.amount, date: view.date }]
    : [];
}

function contributionView(
  goal: Goal,
  contribution: StoredGoalContribution,
  transactions: ReadonlyMap<string, GoalTransaction>,
): GoalContributionView {
  if (contribution.source === 'MANUAL') {
    return {
      contribution,
      state: 'ACTIVE',
      kind: contribution.kind,
      amount: Money.of(contribution.amount, goal.target.currency),
      date: contribution.date,
      transaction: null,
    };
  }
  const transaction = transactions.get(contribution.transactionId) ?? null;

  return {
    contribution,
    state: linkedContributionState(transaction, goal.target.currency),
    kind: 'CONTRIBUTION',
    amount: transaction?.amount ?? null,
    date: transaction?.date ?? null,
    transaction,
  };
}
