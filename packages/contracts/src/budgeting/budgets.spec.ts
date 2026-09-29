import { describe, expect, it } from 'vitest';

import {
  BUDGET_LINES_MAX_ITEMS,
  budgetMonthParamsSchema,
  putBudgetRequestSchema,
} from './budgets.js';

const LINE = {
  categoryId: '01999999-9999-7999-8999-000000000001',
  plannedAmount: '800.00',
  currency: 'PEN',
};

describe('budgetMonthParamsSchema', () => {
  it('reads the year and the month of the route as numbers', () => {
    expect(budgetMonthParamsSchema.parse({ year: '2026', month: '9' })).toEqual({
      year: 2026,
      month: 9,
    });
    expect(budgetMonthParamsSchema.parse({ year: '2026', month: '09' }).month).toBe(9);
  });

  it.each([
    ['a two-digit year', { year: '26', month: '9' }],
    ['a month that is not a number', { year: '2026', month: 'sep' }],
    ['a three-digit month', { year: '2026', month: '100' }],
    ['a negative month', { year: '2026', month: '-1' }],
  ])('rejects %s', (_case, params) => {
    expect(budgetMonthParamsSchema.safeParse(params).success).toBe(false);
  });

  it('leaves month 13 to the domain, which says which rule broke', () => {
    expect(budgetMonthParamsSchema.parse({ year: '2026', month: '13' }).month).toBe(13);
  });
});

describe('putBudgetRequestSchema', () => {
  it('accepts a list of lines, and an empty one', () => {
    expect(putBudgetRequestSchema.parse({ lines: [LINE] })).toEqual({ lines: [LINE] });
    expect(putBudgetRequestSchema.parse({ lines: [] })).toEqual({ lines: [] });
  });

  it('leaves a negative amount or a third decimal to the domain', () => {
    expect(
      putBudgetRequestSchema.safeParse({ lines: [{ ...LINE, plannedAmount: '-1' }] }).success,
    ).toBe(true);
    expect(
      putBudgetRequestSchema.safeParse({ lines: [{ ...LINE, plannedAmount: '1.005' }] }).success,
    ).toBe(true);
  });

  it.each([
    ['an amount as a number', { ...LINE, plannedAmount: 800 }],
    ['an amount that is not decimal', { ...LINE, plannedAmount: '8e2' }],
    ['a currency that does not exist', { ...LINE, currency: 'EUR' }],
    ['a category that is not an id', { ...LINE, categoryId: 'food' }],
    ['an unknown field', { ...LINE, type: 'INCOME' }],
  ])('rejects %s', (_case, line) => {
    expect(putBudgetRequestSchema.safeParse({ lines: [line] }).success).toBe(false);
  });

  it('refuses a userId in the body instead of ignoring it', () => {
    expect(putBudgetRequestSchema.safeParse({ lines: [], userId: 'someone' }).success).toBe(false);
  });

  it('caps the list defensively', () => {
    const lines = Array.from({ length: BUDGET_LINES_MAX_ITEMS + 1 }, () => LINE);

    expect(putBudgetRequestSchema.safeParse({ lines }).success).toBe(false);
  });
});
