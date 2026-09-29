import { Injectable } from '@nestjs/common';
import { Money } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  BudgetMonth,
  BudgetRepository,
  StoredBudgetLine,
} from '../ports/budget-repository.js';

/** Solo lo que sale del módulo: ni `userId` ni ids internos. */
const LINE_FIELDS = { categoryId: true, type: true, plannedAmount: true, currency: true } as const;

@Injectable()
export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lines({ userId, year, month }: BudgetMonth): Promise<StoredBudgetLine[]> {
    // El `userId` va dentro de la consulta: una partida de otra cuenta ni se lee.
    const rows = await this.prisma.budgetLine.findMany({
      where: { userId, budget: { userId, year, month } },
      select: LINE_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se guardaron.
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      categoryId: row.categoryId,
      type: row.type,
      planned: Money.of(row.plannedAmount.toFixed(2), row.currency),
    }));
  }

  async replace(
    month: BudgetMonth,
    lines: readonly StoredBudgetLine[],
  ): Promise<StoredBudgetLine[]> {
    const { userId, year } = month;
    await this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.upsert({
        where: { userId_year_month: { userId, year, month: month.month } },
        create: { userId, year, month: month.month },
        update: {},
        select: { id: true },
      });
      await tx.budgetLine.deleteMany({ where: { budgetId: budget.id, userId } });
      await tx.budgetLine.createMany({
        data: lines.map((line) => ({
          budgetId: budget.id,
          userId,
          categoryId: line.categoryId,
          type: line.type,
          plannedAmount: line.planned.toFixed(),
          currency: line.planned.currency,
        })),
      });
    });

    return this.lines(month);
  }

  async latestBefore(
    target: BudgetMonth,
  ): Promise<{ year: number; month: number; lines: StoredBudgetLine[] } | null> {
    const { userId, year, month } = target;
    const latest = await this.prisma.budget.findFirst({
      where: {
        userId,
        lines: { some: {} },
        OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true },
    });
    if (latest === null) return null;

    return { ...latest, lines: await this.lines({ userId, ...latest }) };
  }

  async mergeCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    // El `userId` va dentro de cada consulta y cada escritura, nunca en una comprobación aparte.
    return this.prisma.$transaction(async (tx) => {
      const moving = await tx.budgetLine.findMany({
        where: { userId, categoryId: fromId },
        select: { id: true, budgetId: true, currency: true, plannedAmount: true },
      });
      for (const from of moving) {
        const into = await tx.budgetLine.findFirst({
          where: { userId, budgetId: from.budgetId, categoryId: intoId, currency: from.currency },
          select: { id: true, plannedAmount: true },
        });
        if (into === null) {
          await tx.budgetLine.updateMany({
            where: { id: from.id, userId },
            data: { categoryId: intoId },
          });
          continue;
        }
        // Las dos tenían partida ese mes y en esa moneda: se suman (2026-09-29).
        const total = Money.of(into.plannedAmount.toFixed(2), from.currency).add(
          Money.of(from.plannedAmount.toFixed(2), from.currency),
        );
        await tx.budgetLine.updateMany({
          where: { id: into.id, userId },
          data: { plannedAmount: total.toFixed() },
        });
        await tx.budgetLine.deleteMany({ where: { id: from.id, userId } });
      }

      return moving.length;
    });
  }
}
