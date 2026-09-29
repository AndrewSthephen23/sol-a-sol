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

  latestBefore(
    month: BudgetMonth,
  ): Promise<{ year: number; month: number; lines: StoredBudgetLine[] } | null> {
    const target = month.year * 12 + month.month;
    const candidates = [...this.months]
      .map(([key, lines]) => {
        const [userId = '', year = '0', monthNumber = '0'] = key.split('|');

        return { userId, year: Number(year), month: Number(monthNumber), lines };
      })
      .filter(
        (candidate) =>
          candidate.userId === month.userId &&
          candidate.lines.length > 0 &&
          candidate.year * 12 + candidate.month < target,
      )
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
    const [latest] = candidates;

    return Promise.resolve(
      latest === undefined
        ? null
        : { year: latest.year, month: latest.month, lines: [...latest.lines] },
    );
  }

  mergeCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    let moved = 0;
    for (const [key, lines] of this.months) {
      if (!key.startsWith(`${userId}|`)) continue;
      const merged = lines.filter((line) => line.categoryId !== fromId);
      for (const from of lines.filter((line) => line.categoryId === fromId)) {
        moved += 1;
        const index = merged.findIndex(
          (line) => line.categoryId === intoId && line.planned.currency === from.planned.currency,
        );
        const into = merged[index];
        if (into === undefined) merged.push({ ...from, categoryId: intoId });
        else merged[index] = { ...into, planned: into.planned.add(from.planned) };
      }
      this.months.set(key, merged);
    }

    return Promise.resolve(moved);
  }
}

function keyOf({ userId, year, month }: BudgetMonth): string {
  return `${userId}|${String(year)}|${String(month)}`;
}
