import { Inject, Injectable } from '@nestjs/common';
import {
  assertGoalContribution,
  assertLinkableTransaction,
  assertWithdrawalCovered,
  type Clock,
  type GoalContributionKind,
  type LocalDate,
  Money,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  GoalArchivedError,
  GoalContributionNotFoundError,
  GoalNotFoundError,
  GoalTransactionNotFoundError,
} from '../domain/errors.js';
import {
  GOAL_CONTRIBUTION_REPOSITORY,
  type GoalContributionRepository,
  type NewGoalContribution,
} from '../ports/goal-contribution-repository.js';
import { type Goal, GOAL_REPOSITORY, type GoalRepository } from '../ports/goal-repository.js';
import {
  GOAL_TRANSACTIONS_READER,
  type GoalTransactionsReader,
} from '../ports/transactions-reader.js';
import {
  type GoalContributionView,
  type GoalView,
  movementOf,
  progressOf,
  resolveGoals,
} from './goal-views.js';

/** Un aporte o un retiro manual, o un aporte enlazado a una transacción (decisión 1). */
export type GoalContributionInput =
  | { source: 'MANUAL'; kind: GoalContributionKind; amount: string; date: LocalDate }
  | { source: 'TRANSACTION'; transactionId: string };

/** Los aportes de una meta como están hoy, primero los más recientes. */
@Injectable()
export class ListGoalContributions {
  constructor(
    @Inject(GOAL_REPOSITORY) readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY) readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, goalId: string): Promise<GoalContributionView[]> {
    const view = await goalView(this, userId, goalId, today(this.clock));

    // Llegan en el orden en que se registraron: al revés, el orden estable deja primero el último
    // registrado entre los del mismo día.
    return [...view.contributions].reverse().sort(newestFirst);
  }
}

/**
 * Registra un aporte o un retiro en una meta **propia y activa**. Uno manual, con monto positivo y
 * fecha de hoy o antes; un retiro no puede sacar más de lo ahorrado. Uno enlazado, a una
 * transacción vigente de ahorro o inversión en la moneda de la meta, que no aporte ya a otra.
 */
@Injectable()
export class AddGoalContribution {
  constructor(
    @Inject(GOAL_REPOSITORY) readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY) readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    goalId: string,
    input: GoalContributionInput,
  ): Promise<GoalContributionView> {
    const day = today(this.clock);
    const current = await goalView(this, userId, goalId, day);
    const { goal } = current;
    if (goal.archivedAt !== null) throw new GoalArchivedError();

    const created = await this.contributions.create(
      userId,
      input.source === 'MANUAL'
        ? this.manual(current, input, day)
        : await this.linked(userId, goal, input.transactionId),
    );
    const [view] = await resolveGoals(this.transactions, userId, [goal], [created], day);
    const [contribution] = view?.contributions ?? [];
    if (contribution === undefined) throw new GoalContributionNotFoundError();

    return contribution;
  }

  private manual(
    current: GoalView,
    input: Extract<GoalContributionInput, { source: 'MANUAL' }>,
    day: LocalDate,
  ): NewGoalContribution {
    const { goal } = current;
    const movement = {
      kind: input.kind,
      amount: Money.of(input.amount, goal.target.currency),
      date: input.date,
    };
    assertGoalContribution(movement, goal.target.currency, day);
    if (movement.kind === 'WITHDRAWAL') {
      assertWithdrawalCovered(progressOf(goal, current.contributions, day, [movement]).saved);
    }

    return {
      goalId: goal.id,
      source: 'MANUAL',
      kind: movement.kind,
      amount: movement.amount.toFixed(),
      date: movement.date,
    };
  }

  private async linked(
    userId: string,
    goal: Goal,
    transactionId: string,
  ): Promise<NewGoalContribution> {
    const [transaction] = await this.transactions.liveTransactions(userId, [transactionId]);
    if (transaction === undefined) throw new GoalTransactionNotFoundError();
    assertLinkableTransaction(transaction, goal.target.currency);

    return { goalId: goal.id, source: 'TRANSACTION', transactionId: transaction.id };
  }
}

/**
 * Deshace un aporte o un retiro, también en una meta archivada. Quitar un aporte que cuenta no
 * puede dejar la meta en negativo: los retiros ya hechos sacarían más de lo ahorrado.
 */
@Injectable()
export class DeleteGoalContribution {
  constructor(
    @Inject(GOAL_REPOSITORY) readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY) readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, goalId: string, id: string): Promise<void> {
    const day = today(this.clock);
    const { goal, contributions } = await goalView(this, userId, goalId, day);
    const target = contributions.find((view) => view.contribution.id === id);
    if (target === undefined) throw new GoalContributionNotFoundError();
    if (movementOf(target).some((movement) => movement.kind === 'CONTRIBUTION')) {
      const rest = contributions.filter((view) => view !== target);
      assertWithdrawalCovered(progressOf(goal, rest, day).saved);
    }

    if (!(await this.contributions.delete(userId, goalId, id))) {
      throw new GoalContributionNotFoundError();
    }
  }
}

interface GoalReaders {
  goals: GoalRepository;
  contributions: GoalContributionRepository;
  transactions: GoalTransactionsReader;
}

/** La meta **de la cuenta** con sus aportes de hoy; 404 si no existe o es ajena. */
async function goalView(
  readers: GoalReaders,
  userId: string,
  goalId: string,
  day: LocalDate,
): Promise<GoalView> {
  const goal = await readers.goals.find(userId, goalId);
  if (goal === null) throw new GoalNotFoundError();
  const contributions = await readers.contributions.listByGoals(userId, [goalId]);
  const [view] = await resolveGoals(readers.transactions, userId, [goal], contributions, day);
  if (view === undefined) throw new GoalNotFoundError();

  return view;
}

/** Por fecha, la más reciente primero; las de una transacción borrada (sin fecha), al final. */
function newestFirst(left: GoalContributionView, right: GoalContributionView): number {
  if (left.date === null || right.date === null) {
    return Number(left.date === null) - Number(right.date === null);
  }

  return right.date.compareTo(left.date);
}
