import { Inject, Injectable } from '@nestjs/common';
import { assertGoalSettings, type Clock, Money, today } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { GoalNotFoundError } from '../domain/errors.js';
import {
  GOAL_CONTRIBUTION_REPOSITORY,
  type GoalContributionRepository,
} from '../ports/goal-contribution-repository.js';
import {
  type Goal,
  GOAL_REPOSITORY,
  type GoalChanges,
  type GoalRepository,
  type NewGoal,
} from '../ports/goal-repository.js';
import {
  GOAL_TRANSACTIONS_READER,
  type GoalTransactionsReader,
} from '../ports/transactions-reader.js';
import { type GoalView, resolveGoals } from './goal-views.js';

/** Las metas de la cuenta con su progreso; las archivadas, solo si se piden. */
@Injectable()
export class ListGoals {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY)
    private readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) private readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, options: { includeArchived: boolean }): Promise<GoalView[]> {
    const goals = await this.goals.list(userId, options);
    const contributions = await this.contributions.listByGoals(
      userId,
      goals.map((goal) => goal.id),
    );

    return resolveGoals(this.transactions, userId, goals, contributions, today(this.clock));
  }
}

/**
 * Crea una meta: objetivo mayor que cero en una moneda, que queda fija, y el fin después del
 * inicio. Las fechas son libres y el inicio puede ser pasado (decisión 6).
 */
@Injectable()
export class CreateGoal {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(GOAL_TRANSACTIONS_READER) private readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, input: NewGoal): Promise<GoalView> {
    assertGoalSettings(input);
    const goal = await this.goals.create(userId, input);

    return viewOf(await resolveGoals(this.transactions, userId, [goal], [], today(this.clock)));
  }
}

export interface GoalUpdate {
  name?: string;
  /** String decimal, en la moneda de la meta: la moneda no se cambia. */
  targetAmount?: string;
  startDate?: Goal['startDate'];
  endDate?: Goal['endDate'];
  archived?: boolean;
}

/**
 * Corrige una meta, también archivada. Las reglas se comprueban sobre la meta **como quedaría**;
 * cambiar el objetivo o las fechas con aportes se permite y todo se recalcula al consultar
 * (2026-10-03).
 */
@Injectable()
export class UpdateGoal {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY)
    private readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) private readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, id: string, update: GoalUpdate): Promise<GoalView> {
    const goal = await this.goals.find(userId, id);
    if (goal === null) throw new GoalNotFoundError();
    const { archived, targetAmount, ...fields } = update;
    const changes: GoalChanges = {
      ...fields,
      ...(targetAmount === undefined
        ? {}
        : { target: Money.of(targetAmount, goal.target.currency) }),
      ...(archived === undefined ? {} : { archivedAt: this.archivedAt(goal, archived) }),
    };
    assertGoalSettings({ ...goal, ...changes });

    const updated = await this.goals.update(userId, id, changes);
    if (updated === null) throw new GoalNotFoundError();
    const contributions = await this.contributions.listByGoals(userId, [id]);

    return viewOf(
      await resolveGoals(this.transactions, userId, [updated], contributions, today(this.clock)),
    );
  }

  /** Archivar dos veces conserva la fecha de la primera. */
  private archivedAt(goal: Goal, archived: boolean): Date | null {
    if (!archived) return null;

    return goal.archivedAt ?? this.clock.now();
  }
}

function viewOf(views: readonly GoalView[]): GoalView {
  const [view] = views;
  if (view === undefined) throw new GoalNotFoundError();

  return view;
}
