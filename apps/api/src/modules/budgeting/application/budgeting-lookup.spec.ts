import { InvalidBudgetMonthError, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBudgetRepository } from '../ports/budget-repository.fake.js';
import { BudgetingLookup } from './budgeting-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

describe('BudgetingLookup', () => {
  let budgets: FakeBudgetRepository;
  let lookup: BudgetingLookup;

  beforeEach(async () => {
    budgets = new FakeBudgetRepository();
    lookup = new BudgetingLookup(budgets);
    await budgets.replace({ userId: ANA, year: 2026, month: 9 }, [
      { categoryId: 'food', type: 'VARIABLE_EXPENSE', planned: Money.of('500.00', 'PEN') },
    ]);
  });

  it('gives the lines of the month', async () => {
    const lines = await lookup.lines(ANA, 2026, 9);

    expect(lines.map((line) => [line.categoryId, line.type, line.planned.toFixed()])).toEqual([
      ['food', 'VARIABLE_EXPENSE', '500.00'],
    ]);
  });

  it('gives nothing for another month or another account', async () => {
    await expect(lookup.lines(ANA, 2026, 10)).resolves.toEqual([]);
    await expect(lookup.lines(BRUNO, 2026, 9)).resolves.toEqual([]);
  });

  it('refuses a month that does not exist', async () => {
    await expect(lookup.lines(ANA, 2026, 13)).rejects.toThrow(InvalidBudgetMonthError);
  });
});
