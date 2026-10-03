import { Injectable } from '@nestjs/common';
import type { GoalContributionKind } from '@sol-a-sol/domain';

import { fromDatabaseDate, toDatabaseDate } from '../../../shared/prisma/database-date.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { GoalTransactionAlreadyLinkedError } from '../domain/errors.js';
import type {
  GoalContributionRepository,
  NewGoalContribution,
  StoredGoalContribution,
} from '../ports/goal-contribution-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale del módulo. */
const CONTRIBUTION_FIELDS = {
  id: true,
  goalId: true,
  kind: true,
  date: true,
  amount: true,
  transactionId: true,
} as const;

interface ContributionRow {
  id: string;
  goalId: string;
  kind: GoalContributionKind;
  date: Date | null;
  amount: { toFixed(decimals: number): string } | null;
  transactionId: string | null;
}

@Injectable()
export class PrismaGoalContributionRepository implements GoalContributionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByGoals(userId: string, goalIds: readonly string[]): Promise<StoredGoalContribution[]> {
    const rows = await this.prisma.goalContribution.findMany({
      where: { userId, goalId: { in: [...goalIds] } },
      select: CONTRIBUTION_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se registraron.
      orderBy: { id: 'asc' },
    });

    return rows.map(contributionOf);
  }

  async create(userId: string, contribution: NewGoalContribution): Promise<StoredGoalContribution> {
    const data =
      contribution.source === 'MANUAL'
        ? {
            userId,
            goalId: contribution.goalId,
            kind: contribution.kind,
            amount: contribution.amount,
            date: toDatabaseDate(contribution.date),
          }
        : { userId, goalId: contribution.goalId, transactionId: contribution.transactionId };
    try {
      // La clave compuesta `(goal_id, user_id)` exige que la meta sea de la cuenta.
      const row = await this.prisma.goalContribution.create({ data, select: CONTRIBUTION_FIELDS });

      return contributionOf(row);
    } catch (error) {
      // El índice único de `transaction_id` es el que decide: dos peticiones a la vez no se cuelan.
      if (isUniqueViolation(error)) throw new GoalTransactionAlreadyLinkedError();
      throw error;
    }
  }

  async delete(userId: string, goalId: string, id: string): Promise<boolean> {
    // `userId` y la meta van en el propio DELETE: un id ajeno no coincide con ninguna fila.
    const { count } = await this.prisma.goalContribution.deleteMany({
      where: { id, userId, goalId },
    });

    return count > 0;
  }
}

/** La base garantiza la forma (`CHECK`): manual con fecha y monto, o enlazado sin ninguno. */
function contributionOf(row: ContributionRow): StoredGoalContribution {
  if (row.transactionId !== null) {
    return {
      id: row.id,
      goalId: row.goalId,
      source: 'TRANSACTION',
      transactionId: row.transactionId,
    };
  }

  if (row.amount === null || row.date === null) {
    throw new Error(`Goal contribution ${row.id} breaks goal_contributions_manual_or_linked.`);
  }

  return {
    id: row.id,
    goalId: row.goalId,
    source: 'MANUAL',
    kind: row.kind,
    amount: row.amount.toFixed(2),
    date: fromDatabaseDate(row.date),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
