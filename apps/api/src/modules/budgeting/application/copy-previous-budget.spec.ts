import { InvalidBudgetMonthError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeBudgetActualsReader } from '../ports/actuals-reader.fake.js';
import type { BudgetMonth } from '../ports/budget-repository.js';
import { FakeBudgetRepository } from '../ports/budget-repository.fake.js';
import { FakeBudgetCatalogReader } from '../ports/catalog-reader.fake.js';
import { type Budget, GetBudget, ReplaceBudget } from './budgets.js';
import { CopyPreviousBudget } from './copy-previous-budget.js';
import { ReassignBudgetCategory } from './reassign-budget-category.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const FOOD = 'category-food';
const RENT = 'category-rent';
const GROCERIES = 'category-groceries';
const CINEMA = 'category-cinema';
const SALARY = 'category-salary';

const month = (year: number, monthNumber: number, userId = ANA): BudgetMonth => ({
  userId,
  year,
  month: monthNumber,
});

function linesOf(budget: Budget) {
  return budget.lines.map((line) => [
    line.categoryId,
    line.planned.toFixed(),
    line.planned.currency,
  ]);
}

describe('budget copy and category merges', () => {
  let budgets: FakeBudgetRepository;
  let catalog: FakeBudgetCatalogReader;
  let replace: ReplaceBudget;
  let copy: CopyPreviousBudget;
  let reassign: ReassignBudgetCategory;

  beforeEach(() => {
    budgets = new FakeBudgetRepository();
    catalog = new FakeBudgetCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, GROCERIES, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, RENT, { type: 'FIXED_EXPENSE' })
      .withCategory(ANA, CINEMA, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, SALARY, { type: 'INCOME' })
      .withCategory(BRUNO, 'bruno-food', { type: 'VARIABLE_EXPENSE' });
    const get = new GetBudget(budgets, catalog, new FakeBudgetActualsReader());
    replace = new ReplaceBudget(budgets, catalog, get);
    copy = new CopyPreviousBudget(budgets, catalog, get);
    reassign = new ReassignBudgetCategory(budgets);
  });

  describe('CopyPreviousBudget', () => {
    it('copies the previous month into an empty one', async () => {
      await replace.execute(month(2026, 8), [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
        { categoryId: RENT, plannedAmount: '1500', currency: 'PEN' },
      ]);

      const copied = await copy.execute(month(2026, 9));

      expect(copied.copiedFrom).toEqual({ year: 2026, month: 8 });
      expect(copied.skipped).toEqual([]);
      expect(linesOf(copied)).toEqual([
        [FOOD, '800.00', 'PEN'],
        [RENT, '1500.00', 'PEN'],
      ]);
    });

    it('only fills in what is missing, never overwriting a line', async () => {
      await replace.execute(month(2026, 8), [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
        { categoryId: FOOD, plannedAmount: '50', currency: 'USD' },
        { categoryId: RENT, plannedAmount: '1500', currency: 'PEN' },
      ]);
      await replace.execute(month(2026, 9), [
        { categoryId: FOOD, plannedAmount: '900', currency: 'PEN' },
      ]);

      const copied = await copy.execute(month(2026, 9));

      expect(linesOf(copied)).toEqual([
        [FOOD, '900.00', 'PEN'],
        [FOOD, '50.00', 'USD'],
        [RENT, '1500.00', 'PEN'],
      ]);
    });

    it('goes back to the last month with a budget when the previous one is empty', async () => {
      await replace.execute(month(2026, 5), [
        { categoryId: FOOD, plannedAmount: '1', currency: 'PEN' },
      ]);
      await replace.execute(month(2026, 6), [
        { categoryId: FOOD, plannedAmount: '600', currency: 'PEN' },
      ]);
      await replace.execute(month(2026, 8), []);
      // Un mes posterior no es «anterior»: no se copia de él.
      await replace.execute(month(2026, 12), [
        { categoryId: RENT, plannedAmount: '9', currency: 'PEN' },
      ]);

      const copied = await copy.execute(month(2026, 9));

      expect(copied.copiedFrom).toEqual({ year: 2026, month: 6 });
      expect(linesOf(copied)).toEqual([[FOOD, '600.00', 'PEN']]);
    });

    it('copies December into January of the next year', async () => {
      await replace.execute(month(2026, 12), [
        { categoryId: FOOD, plannedAmount: '1', currency: 'PEN' },
      ]);

      await expect(copy.execute(month(2027, 1))).resolves.toMatchObject({
        copiedFrom: { year: 2026, month: 12 },
      });
    });

    it('leaves out archived categories, and says which', async () => {
      await replace.execute(month(2026, 8), [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
        { categoryId: CINEMA, plannedAmount: '60', currency: 'PEN' },
      ]);
      catalog.withCategory(ANA, CINEMA, { type: 'VARIABLE_EXPENSE', archived: true });

      const copied = await copy.execute(month(2026, 9));

      expect(linesOf(copied)).toEqual([[FOOD, '800.00', 'PEN']]);
      expect(copied.skipped).toEqual([{ categoryId: CINEMA, currency: 'PEN' }]);
    });

    it('copies nothing, and is not an error, without any previous budget', async () => {
      await replace.execute(month(2026, 9), [
        { categoryId: FOOD, plannedAmount: '5', currency: 'PEN' },
      ]);

      const copied = await copy.execute(month(2026, 9));

      expect(copied.copiedFrom).toBeNull();
      expect(copied.skipped).toEqual([]);
      expect(linesOf(copied)).toEqual([[FOOD, '5.00', 'PEN']]);
    });

    it('never copies from another account', async () => {
      await replace.execute(month(2026, 8, BRUNO), [
        { categoryId: 'bruno-food', plannedAmount: '1', currency: 'PEN' },
      ]);

      await expect(copy.execute(month(2026, 9))).resolves.toMatchObject({
        copiedFrom: null,
        lines: [],
      });
    });

    it('refuses a month that does not exist', async () => {
      await expect(copy.execute(month(2026, 13))).rejects.toThrow(InvalidBudgetMonthError);
    });
  });

  describe('ReassignBudgetCategory', () => {
    it('moves the lines to the category they were merged into, in every month', async () => {
      await replace.execute(month(2026, 8), [
        { categoryId: GROCERIES, plannedAmount: '300', currency: 'PEN' },
      ]);
      await replace.execute(month(2026, 9), [
        { categoryId: GROCERIES, plannedAmount: '350', currency: 'PEN' },
      ]);

      await expect(
        reassign.execute({ userId: ANA, fromId: GROCERIES, intoId: FOOD }),
      ).resolves.toBe(2);

      for (const [monthNumber, amount] of [
        [8, '300.00'],
        [9, '350.00'],
      ] as const) {
        const lines = await budgets.lines(month(2026, monthNumber));
        expect(lines.map((line) => [line.categoryId, line.planned.toFixed()])).toEqual([
          [FOOD, amount],
        ]);
      }
    });

    it('adds the amounts up when both had a line that month in that currency', async () => {
      await replace.execute(month(2026, 9), [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
        { categoryId: GROCERIES, plannedAmount: '300.50', currency: 'PEN' },
        { categoryId: GROCERIES, plannedAmount: '20', currency: 'USD' },
      ]);

      await reassign.execute({ userId: ANA, fromId: GROCERIES, intoId: FOOD });

      const lines = await budgets.lines(month(2026, 9));
      expect(
        lines.map((line) => [line.categoryId, line.planned.toFixed(), line.planned.currency]),
      ).toEqual([
        [FOOD, '1100.50', 'PEN'],
        [FOOD, '20.00', 'USD'],
      ]);
    });

    it('changes nothing the second time, nor in another account', async () => {
      await replace.execute(month(2026, 9), [
        { categoryId: GROCERIES, plannedAmount: '300', currency: 'PEN' },
      ]);
      await reassign.execute({ userId: ANA, fromId: GROCERIES, intoId: FOOD });

      await expect(
        reassign.execute({ userId: ANA, fromId: GROCERIES, intoId: FOOD }),
      ).resolves.toBe(0);
      await expect(
        reassign.execute({ userId: BRUNO, fromId: FOOD, intoId: GROCERIES }),
      ).resolves.toBe(0);
      expect((await budgets.lines(month(2026, 9))).map((line) => line.categoryId)).toEqual([FOOD]);
    });
  });
});
