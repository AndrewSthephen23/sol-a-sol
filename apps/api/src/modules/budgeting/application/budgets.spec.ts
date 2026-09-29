import {
  ArchivedCategoryError,
  BudgetCategoryNotTopLevelError,
  DuplicatedBudgetLineError,
  InvalidAmountError,
  InvalidBudgetMonthError,
  NegativeBudgetAmountError,
} from '@sol-a-sol/domain';
import { LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { BudgetCategoryNotFoundError } from '../domain/errors.js';
import { FakeBudgetActualsReader } from '../ports/actuals-reader.fake.js';
import { FakeBudgetRepository } from '../ports/budget-repository.fake.js';
import { FakeBudgetCatalogReader } from '../ports/catalog-reader.fake.js';
import { type Budget, GetBudget, ReplaceBudget } from './budgets.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const FOOD = 'category-food';
const DELIVERY = 'category-delivery';
const SALARY = 'category-salary';
const CINEMA = 'category-cinema';
const BRUNO_FOOD = 'category-bruno-food';
const SEPTEMBER = { userId: ANA, year: 2026, month: 9 };

/** Las partidas como texto, para comparar sin depender de cómo guarda `Money` sus decimales. */
function linesOf(budget: Budget) {
  return budget.lines.map((line) => [
    line.categoryId,
    line.type,
    line.planned.toFixed(),
    line.planned.currency,
  ]);
}

describe('budgets', () => {
  let budgets: FakeBudgetRepository;
  let catalog: FakeBudgetCatalogReader;
  let actuals: FakeBudgetActualsReader;
  let get: GetBudget;
  let replace: ReplaceBudget;

  beforeEach(() => {
    budgets = new FakeBudgetRepository();
    catalog = new FakeBudgetCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, DELIVERY, { type: 'VARIABLE_EXPENSE', parentId: FOOD })
      .withCategory(ANA, SALARY, { type: 'INCOME' })
      .withCategory(ANA, CINEMA, { type: 'VARIABLE_EXPENSE', archived: true })
      .withCategory(BRUNO, BRUNO_FOOD, { type: 'VARIABLE_EXPENSE' });
    actuals = new FakeBudgetActualsReader();
    get = new GetBudget(budgets, catalog, actuals);
    replace = new ReplaceBudget(budgets, catalog, get);
  });

  describe('GetBudget', () => {
    it('answers a month without a budget with no lines, not an error', async () => {
      await expect(get.execute(SEPTEMBER)).resolves.toEqual({
        year: 2026,
        month: 9,
        lines: [],
        summary: [],
      });
    });

    it('refuses a month that does not exist', async () => {
      await expect(get.execute({ ...SEPTEMBER, month: 13 })).rejects.toThrow(
        InvalidBudgetMonthError,
      );
    });
  });

  describe('planned against actual', () => {
    function spent(date: string, categoryId: string, amount: Money, userId = ANA) {
      actuals.with({
        userId,
        date: LocalDate.parse(date),
        categoryId,
        type: 'VARIABLE_EXPENSE',
        amount,
      });
    }

    /** El resumen como texto, para comparar sin depender de cómo guarda `Money` sus decimales. */
    async function summaryOf() {
      const { summary } = await get.execute(SEPTEMBER);

      return summary.map((report) => ({
        type: report.type,
        currency: report.currency,
        lines: report.lines.map((line) => [line.categoryId, line.actual.toFixed(), line.status]),
        unbudgeted: report.unbudgeted.map((entry) => [entry.categoryId, entry.amount.toFixed()]),
        total: report.total.actual.toFixed(),
      }));
    }

    it('adds up what the subcategories spent into the line of their parent', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);
      spent('2026-09-03', FOOD, Money.of('100', 'PEN'));
      spent('2026-09-04', DELIVERY, Money.of('50.40', 'PEN'));

      await expect(summaryOf()).resolves.toEqual([
        {
          type: 'VARIABLE_EXPENSE',
          currency: 'PEN',
          lines: [[FOOD, '150.40', 'WITHIN']],
          unbudgeted: [],
          total: '150.40',
        },
      ]);
    });

    it('counts only the days of the month, first and last included', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '10', currency: 'PEN' },
      ]);
      spent('2026-08-31', FOOD, Money.of('1000', 'PEN'));
      spent('2026-09-01', FOOD, Money.of('4', 'PEN'));
      spent('2026-09-30', FOOD, Money.of('7', 'PEN'));
      spent('2026-10-01', FOOD, Money.of('1000', 'PEN'));

      await expect(summaryOf()).resolves.toMatchObject([{ lines: [[FOOD, '11.00', 'EXCEEDED']] }]);
    });

    it('shows spending without a line, and a month without a budget still shows what was spent', async () => {
      spent('2026-09-10', CINEMA, Money.of('45', 'PEN'));

      await expect(summaryOf()).resolves.toEqual([
        {
          type: 'VARIABLE_EXPENSE',
          currency: 'PEN',
          lines: [],
          unbudgeted: [[CINEMA, '45.00']],
          total: '45.00',
        },
      ]);
    });

    it('never mixes currencies, nor what another account spent', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);
      spent('2026-09-10', FOOD, Money.of('20', 'USD'));
      spent('2026-09-10', FOOD, Money.of('999', 'PEN'), BRUNO);

      await expect(summaryOf()).resolves.toEqual([
        {
          type: 'VARIABLE_EXPENSE',
          currency: 'PEN',
          lines: [[FOOD, '0.00', 'WITHIN']],
          unbudgeted: [],
          total: '0.00',
        },
        {
          type: 'VARIABLE_EXPENSE',
          currency: 'USD',
          lines: [],
          unbudgeted: [[FOOD, '20.00']],
          total: '20.00',
        },
      ]);
    });

    it('answers a save with the actual next to the lines', async () => {
      spent('2026-09-10', FOOD, Money.of('900', 'PEN'));

      const saved = await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);

      expect(saved.summary[0]?.lines[0]).toMatchObject({ categoryId: FOOD, status: 'EXCEEDED' });
    });
  });

  describe('ReplaceBudget', () => {
    it('saves the lines with the type of their category, and reads them back', async () => {
      const saved = await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
        { categoryId: FOOD, plannedAmount: '50.5', currency: 'USD' },
        { categoryId: SALARY, plannedAmount: '4000.00', currency: 'PEN' },
      ]);

      const expected = [
        [FOOD, 'VARIABLE_EXPENSE', '800.00', 'PEN'],
        [FOOD, 'VARIABLE_EXPENSE', '50.50', 'USD'],
        [SALARY, 'INCOME', '4000.00', 'PEN'],
      ];
      expect(linesOf(saved)).toEqual(expected);
      expect(linesOf(await get.execute(SEPTEMBER))).toEqual(expected);
    });

    it('replaces the whole month, and an empty list empties it', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);
      await replace.execute(SEPTEMBER, [
        { categoryId: SALARY, plannedAmount: '1', currency: 'PEN' },
      ]);
      expect(linesOf(await get.execute(SEPTEMBER))).toEqual([[SALARY, 'INCOME', '1.00', 'PEN']]);

      await replace.execute(SEPTEMBER, []);
      expect((await get.execute(SEPTEMBER)).lines).toEqual([]);
    });

    it('allows a zero line, and any month, past or future', async () => {
      for (const month of [
        { ...SEPTEMBER, year: 2025, month: 1 },
        { ...SEPTEMBER, year: 2027, month: 12 },
      ]) {
        const saved = await replace.execute(month, [
          { categoryId: FOOD, plannedAmount: '0', currency: 'PEN' },
        ]);
        expect(linesOf(saved)).toEqual([[FOOD, 'VARIABLE_EXPENSE', '0.00', 'PEN']]);
      }
    });

    it.each([
      [
        'a month that does not exist',
        { ...SEPTEMBER, month: 0 },
        FOOD,
        '1',
        InvalidBudgetMonthError,
      ],
      ['a negative amount', SEPTEMBER, FOOD, '-1', NegativeBudgetAmountError],
      ['a third decimal, never rounded', SEPTEMBER, FOOD, '1.005', InvalidAmountError],
      ['a subcategory', SEPTEMBER, DELIVERY, '1', BudgetCategoryNotTopLevelError],
      ['an archived category', SEPTEMBER, CINEMA, '1', ArchivedCategoryError],
      [
        'a category that does not exist',
        SEPTEMBER,
        'category-missing',
        '1',
        BudgetCategoryNotFoundError,
      ],
      ['a category of another account', SEPTEMBER, BRUNO_FOOD, '1', BudgetCategoryNotFoundError],
    ])('refuses %s and saves nothing', async (_case, month, categoryId, plannedAmount, error) => {
      await expect(
        replace.execute(month, [{ categoryId, plannedAmount, currency: 'PEN' }]),
      ).rejects.toThrow(error);
      expect((await get.execute(SEPTEMBER)).lines).toEqual([]);
    });

    it('refuses the same category twice in the same currency', async () => {
      await expect(
        replace.execute(SEPTEMBER, [
          { categoryId: FOOD, plannedAmount: '1', currency: 'PEN' },
          { categoryId: FOOD, plannedAmount: '2', currency: 'PEN' },
        ]),
      ).rejects.toThrow(DuplicatedBudgetLineError);
    });

    it('keeps a line the month already had, even if its category was archived later', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);
      catalog.withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE', archived: true });

      const saved = await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '900', currency: 'PEN' },
      ]);

      expect(linesOf(saved)).toEqual([[FOOD, 'VARIABLE_EXPENSE', '900.00', 'PEN']]);
      // En otro mes, en cambio, la categoría archivada no recibe una partida nueva.
      await expect(
        replace.execute({ ...SEPTEMBER, month: 10 }, [
          { categoryId: FOOD, plannedAmount: '1', currency: 'PEN' },
        ]),
      ).rejects.toThrow(ArchivedCategoryError);
    });

    it('never touches the budget of another account', async () => {
      await replace.execute(SEPTEMBER, [
        { categoryId: FOOD, plannedAmount: '800', currency: 'PEN' },
      ]);

      await replace.execute({ ...SEPTEMBER, userId: BRUNO }, []);

      expect(linesOf(await get.execute(SEPTEMBER))).toEqual([
        [FOOD, 'VARIABLE_EXPENSE', '800.00', 'PEN'],
      ]);
    });
  });
});
