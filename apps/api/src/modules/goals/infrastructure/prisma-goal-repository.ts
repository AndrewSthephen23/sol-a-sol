import { Injectable } from '@nestjs/common';
import { type Currency, Money } from '@sol-a-sol/domain';

import { fromDatabaseDate, toDatabaseDate } from '../../../shared/prisma/database-date.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { GoalNameTakenError } from '../domain/errors.js';
import type { Goal, GoalChanges, GoalRepository, NewGoal } from '../ports/goal-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale del módulo. */
const GOAL_FIELDS = {
  id: true,
  name: true,
  targetAmount: true,
  currency: true,
  startDate: true,
  endDate: true,
  archivedAt: true,
} as const;

interface GoalRow {
  id: string;
  name: string;
  targetAmount: { toFixed(decimals: number): string };
  currency: Currency;
  startDate: Date;
  endDate: Date;
  archivedAt: Date | null;
}

@Injectable()
export class PrismaGoalRepository implements GoalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, options: { includeArchived: boolean }): Promise<Goal[]> {
    const rows = await this.prisma.savingsGoal.findMany({
      where: { userId, ...(options.includeArchived ? {} : { archivedAt: null }) },
      select: GOAL_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se crearon.
      orderBy: { id: 'asc' },
    });

    return rows.map(goalOf);
  }

  async find(userId: string, id: string): Promise<Goal | null> {
    const row = await this.prisma.savingsGoal.findFirst({
      where: { id, userId },
      select: GOAL_FIELDS,
    });

    return row === null ? null : goalOf(row);
  }

  async create(userId: string, goal: NewGoal): Promise<Goal> {
    const row = await nameMustBeFree(() =>
      this.prisma.savingsGoal.create({
        data: {
          userId,
          name: goal.name,
          targetAmount: goal.target.toFixed(),
          currency: goal.target.currency,
          startDate: toDatabaseDate(goal.startDate),
          endDate: toDatabaseDate(goal.endDate),
        },
        select: GOAL_FIELDS,
      }),
    );

    return goalOf(row);
  }

  async update(userId: string, id: string, changes: GoalChanges): Promise<Goal | null> {
    // `userId` va en el propio UPDATE: aunque alguien adivine el id de una meta ajena, la fila no
    // coincide y no se toca. La moneda no se cambia: solo el monto del objetivo.
    const { count } = await nameMustBeFree(() =>
      this.prisma.savingsGoal.updateMany({
        where: { id, userId },
        data: {
          name: changes.name,
          targetAmount: changes.target?.toFixed(),
          startDate: changes.startDate && toDatabaseDate(changes.startDate),
          endDate: changes.endDate && toDatabaseDate(changes.endDate),
          archivedAt: changes.archivedAt,
        },
      }),
    );
    if (count === 0) return null;

    return this.find(userId, id);
  }
}

function goalOf(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    target: Money.of(row.targetAmount.toFixed(2), row.currency),
    startDate: fromDatabaseDate(row.startDate),
    endDate: fromDatabaseDate(row.endDate),
    archivedAt: row.archivedAt,
  };
}

/** El índice `savings_goals_unique_name` es el que decide: dos peticiones a la vez no se cuelan. */
async function nameMustBeFree<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new GoalNameTakenError();
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
