import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  type GoalMovement,
  type LocalDate,
  type Money,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  GOAL_CONTRIBUTION_REPOSITORY,
  type GoalContributionRepository,
} from '../ports/goal-contribution-repository.js';
import { GOAL_REPOSITORY, type GoalRepository } from '../ports/goal-repository.js';
import {
  GOAL_TRANSACTIONS_READER,
  type GoalTransactionsReader,
} from '../ports/transactions-reader.js';
import { movementOf, resolveGoals } from './goal-views.js';

/** Una meta con todo lo que hace falta para medirla a cualquier fecha. */
export interface GoalWithMovements {
  goalId: string;
  name: string;
  archived: boolean;
  target: Money;
  startDate: LocalDate;
  endDate: LocalDate;
  /** Los aportes y retiros que cuentan hoy: los enlazados, con su transacción como está hoy. */
  contributions: GoalMovement[];
}

/**
 * Lecturas que `goals` ofrece a otros módulos por su API pública (`index.ts`), para que el resumen
 * mensual (H6) no lea sus tablas ni importe su interior. Exige el `userId`.
 */
@Injectable()
export class GoalsLookup {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(GOAL_CONTRIBUTION_REPOSITORY)
    private readonly contributions: GoalContributionRepository,
    @Inject(GOAL_TRANSACTIONS_READER) private readonly transactions: GoalTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Todas las metas de la cuenta, archivadas incluidas, en el orden en que se crearon, con sus
   * movimientos que cuentan. Quién se muestra y a qué fecha se mide lo decide quien lee.
   */
  async goalsWithMovements(userId: string): Promise<GoalWithMovements[]> {
    const goals = await this.goals.list(userId, { includeArchived: true });
    const contributions = await this.contributions.listByGoals(
      userId,
      goals.map((goal) => goal.id),
    );
    const views = await resolveGoals(
      this.transactions,
      userId,
      goals,
      contributions,
      today(this.clock),
    );

    return views.map(({ goal, contributions: resolved }) => ({
      goalId: goal.id,
      name: goal.name,
      archived: goal.archivedAt !== null,
      target: goal.target,
      startDate: goal.startDate,
      endDate: goal.endDate,
      contributions: resolved.flatMap(movementOf),
    }));
  }
}
