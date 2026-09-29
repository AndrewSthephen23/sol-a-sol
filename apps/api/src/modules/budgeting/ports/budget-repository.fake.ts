import type { BudgetMonth, BudgetRepository, StoredBudgetLine } from './budget-repository.js';

/** Presupuestos en memoria, por cuenta y mes. */
export class FakeBudgetRepository implements BudgetRepository {
  private readonly months = new Map<string, StoredBudgetLine[]>();

  lines(month: BudgetMonth): Promise<StoredBudgetLine[]> {
    return Promise.resolve([...(this.months.get(keyOf(month)) ?? [])]);
  }

  replace(month: BudgetMonth, lines: readonly StoredBudgetLine[]): Promise<StoredBudgetLine[]> {
    this.months.set(keyOf(month), [...lines]);

    return this.lines(month);
  }
}

function keyOf({ userId, year, month }: BudgetMonth): string {
  return `${userId}|${String(year)}|${String(month)}`;
}
