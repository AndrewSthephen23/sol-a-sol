import { describe, expect, it } from 'vitest';

import { CurrencyMismatchError, InvalidAmountError, Money } from '../money/money.js';
import { ArchivedCategoryError } from '../transactions/transaction-policy.js';
import {
  assertBudgetableCategory,
  assertBudgetLines,
  assertBudgetMonth,
  assertPlannedAmount,
  BudgetCategoryNotTopLevelError,
  budgetKind,
  computeBudgetVariance,
  DuplicatedBudgetLineError,
  InvalidBudgetMonthError,
  NegativeBudgetAmountError,
} from './budget-policy.js';

const pen = (amount: string) => Money.of(amount, 'PEN');

describe('budgetKind', () => {
  it.each(['FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'DEBT'] as const)(
    'reads %s as a limit: spending more is bad',
    (type) => {
      expect(budgetKind(type)).toBe('LIMIT');
    },
  );

  it.each(['INCOME', 'SAVING', 'INVESTMENT'] as const)(
    'reads %s as a goal: reaching it is good',
    (type) => {
      expect(budgetKind(type)).toBe('GOAL');
    },
  );
});

describe('assertPlannedAmount', () => {
  it('accepts zero, which means "spend nothing here"', () => {
    expect(() => {
      assertPlannedAmount(pen('0'));
    }).not.toThrow();
  });

  it('accepts a positive amount', () => {
    expect(() => {
      assertPlannedAmount(pen('0.01'));
    }).not.toThrow();
  });

  it('refuses a negative amount with its own error', () => {
    expect(() => {
      assertPlannedAmount(pen('-0.01'));
    }).toThrow(NegativeBudgetAmountError);
    expect(new NegativeBudgetAmountError().code).toBe('BUDGET_AMOUNT_NEGATIVE');
    expect(new NegativeBudgetAmountError().message).toContain('cannot be negative');
  });

  it('never gets a third decimal: Money refuses it before', () => {
    expect(() => pen('800.005')).toThrow(InvalidAmountError);
  });
});

describe('assertBudgetMonth', () => {
  it.each([
    [2026, 1],
    [2026, 12],
    [2000, 6],
    [2100, 6],
  ])('accepts %i-%i', (year, month) => {
    expect(() => {
      assertBudgetMonth(year, month);
    }).not.toThrow();
  });

  it.each([
    [2026, 0],
    [2026, 13],
    [2026, 1.5],
    [1999, 6],
    [2101, 6],
    [2026.5, 6],
  ])('refuses %d-%d', (year, month) => {
    expect(() => {
      assertBudgetMonth(year, month);
    }).toThrow(InvalidBudgetMonthError);
  });

  it('says which month it refused, with a stable code', () => {
    const error = new InvalidBudgetMonthError(2026, 13);

    expect(error.code).toBe('BUDGET_MONTH_INVALID');
    expect(error.message).toContain('2026-13');
  });
});

describe('assertBudgetableCategory', () => {
  it('accepts an active top-level category', () => {
    expect(() => {
      assertBudgetableCategory({ parentId: null, archived: false });
    }).not.toThrow();
  });

  it('refuses a subcategory: the line goes on its parent, which already adds it up', () => {
    expect(() => {
      assertBudgetableCategory({ parentId: 'food', archived: false });
    }).toThrow(BudgetCategoryNotTopLevelError);
    expect(new BudgetCategoryNotTopLevelError().code).toBe('BUDGET_CATEGORY_NOT_TOP_LEVEL');
    expect(new BudgetCategoryNotTopLevelError().message).toContain('top-level category');
  });

  it('refuses an archived category, like a new transaction does', () => {
    expect(() => {
      assertBudgetableCategory({ parentId: null, archived: true });
    }).toThrow(ArchivedCategoryError);
  });
});

describe('assertBudgetLines', () => {
  const food = { categoryId: 'food', planned: pen('800') };

  it('accepts one line per category and currency', () => {
    expect(() => {
      assertBudgetLines([
        food,
        { categoryId: 'food', planned: Money.of('50', 'USD') },
        { categoryId: 'rent', planned: pen('1500') },
      ]);
    }).not.toThrow();
  });

  it('accepts an empty month', () => {
    expect(() => {
      assertBudgetLines([]);
    }).not.toThrow();
  });

  it('refuses the same category twice in the same currency, naming it', () => {
    let caught: unknown;
    try {
      assertBudgetLines([food, { categoryId: 'food', planned: pen('100') }]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DuplicatedBudgetLineError);
    expect((caught as DuplicatedBudgetLineError).code).toBe('BUDGET_LINE_DUPLICATED');
    expect((caught as DuplicatedBudgetLineError).categoryId).toBe('food');
    expect((caught as DuplicatedBudgetLineError).message).toContain('food in PEN');
  });

  it('checks every planned amount', () => {
    expect(() => {
      assertBudgetLines([food, { categoryId: 'rent', planned: pen('-1') }]);
    }).toThrow(NegativeBudgetAmountError);
  });
});

describe('computeBudgetVariance', () => {
  describe('for a limit (expenses and debt)', () => {
    it('says how much is left: planned minus actual', () => {
      expect(computeBudgetVariance('VARIABLE_EXPENSE', pen('800'), pen('550'))).toEqual({
        planned: pen('800'),
        actual: pen('550'),
        difference: pen('250'),
        executed: pen('550').percentageOf(pen('800')),
        status: 'WITHIN',
      });
    });

    it('is exceeded as soon as the actual goes over, with a negative difference', () => {
      const variance = computeBudgetVariance('FIXED_EXPENSE', pen('500'), pen('500.01'));

      expect(variance.status).toBe('EXCEEDED');
      expect(variance.difference.toFixed()).toBe('-0.01');
    });

    it('is not exceeded when the actual is exactly the planned amount', () => {
      const variance = computeBudgetVariance('DEBT', pen('300'), pen('300'));

      expect(variance.status).toBe('WITHIN');
      expect(variance.executed?.toString()).toBe('100');
    });

    it('keeps the percentage exact, rounding only to show it', () => {
      expect(
        computeBudgetVariance('VARIABLE_EXPENSE', pen('30'), pen('11')).executed?.toFixed(2),
      ).toBe('36.67');
    });

    it('with a zero budget, has no percentage and any spending exceeds it', () => {
      expect(computeBudgetVariance('VARIABLE_EXPENSE', pen('0'), pen('0'))).toMatchObject({
        executed: null,
        status: 'WITHIN',
      });
      expect(computeBudgetVariance('VARIABLE_EXPENSE', pen('0'), pen('4.50'))).toMatchObject({
        executed: null,
        status: 'EXCEEDED',
      });
    });
  });

  describe('for a goal (income, saving and investment)', () => {
    it('says how far past the goal: actual minus planned', () => {
      expect(computeBudgetVariance('SAVING', pen('500'), pen('650'))).toMatchObject({
        difference: pen('150'),
        status: 'MET',
      });
    });

    it('is met when reaching it exactly, and pending below it', () => {
      expect(computeBudgetVariance('INCOME', pen('4000'), pen('4000')).status).toBe('MET');
      expect(computeBudgetVariance('INVESTMENT', pen('200'), pen('199.99'))).toMatchObject({
        difference: pen('-0.01'),
        status: 'PENDING',
      });
    });

    it('with a zero goal, is already met and has no percentage', () => {
      expect(computeBudgetVariance('SAVING', pen('0'), pen('0'))).toMatchObject({
        executed: null,
        status: 'MET',
      });
    });
  });

  it('never compares soles with dollars', () => {
    expect(() =>
      computeBudgetVariance('VARIABLE_EXPENSE', pen('800'), Money.of('10', 'USD')),
    ).toThrow(CurrencyMismatchError);
  });
});
