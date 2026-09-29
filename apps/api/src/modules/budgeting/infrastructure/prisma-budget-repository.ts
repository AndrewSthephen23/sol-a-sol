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
}
