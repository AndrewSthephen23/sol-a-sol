import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import {
  ANNUAL_ROWS,
  annualSummaryPeriod,
  type AnnualSummaryInput,
  computeAnnualSummary,
  SummaryYearInFutureError,
  SummaryYearInvalidError,
} from './annual-summary.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const date = (text: string) => LocalDate.parse(text);
const day = (on: string, type: TransactionType, amount: Money) => ({
  date: date(on),
  type,
  amount,
});

/** El año 2025, ya cerrado (hoy es 3 de octubre de 2026). */
function summary(overrides: Partial<AnnualSummaryInput> = {}) {
  return computeAnnualSummary({
    year: 2025,
    today: date('2026-10-03'),
    byDay: [],
    byCategory: [],
    ...overrides,
  });
}

/** Una fila como texto: los 12 meses (`—` si todavía no llegan) y el total. */
function plainRow(
  result: ReturnType<typeof computeAnnualSummary>,
  row: (typeof ANNUAL_ROWS)[number],
  currency = 0,
) {
  const found = result.currencies[currency]?.rows.find((entry) => entry.row === row);

  return {
    months: found?.months.map((month) => month?.toFixed() ?? '—'),
    total: found?.total.toFixed(),
  };
}

describe('annualSummaryPeriod', () => {
  it('covers a closed year whole', () => {
    const period = annualSummaryPeriod(2025, date('2026-10-03'));

    expect(period.from.toString()).toBe('2025-01-01');
    expect(period.to.toString()).toBe('2025-12-31');
  });

  it('covers the year in course up to today', () => {
    const period = annualSummaryPeriod(2026, date('2026-10-03'));

    expect(period.from.toString()).toBe('2026-01-01');
    expect(period.to.toString()).toBe('2026-10-03');
  });

  it('refuses a year that has not started', () => {
    expect(() => annualSummaryPeriod(2027, date('2026-12-31'))).toThrow(SummaryYearInFutureError);
    expect(() => annualSummaryPeriod(2027, date('2026-12-31'))).toThrow(
      expect.objectContaining({
        code: 'SUMMARY_YEAR_IN_FUTURE',
        message: 'There is no summary of 2027 yet: it has not started.',
      }) as Error,
    );
  });

  it.each([1999, 2101, 2025.5])('refuses the year %s', (year) => {
    expect(() => annualSummaryPeriod(year, date('2026-10-03'))).toThrow(
      expect.objectContaining({
        code: 'SUMMARY_YEAR_INVALID',
        message: `A summary is of a year between 2000 and 2100: got ${String(year)}.`,
      }) as Error,
    );
    expect(() => annualSummaryPeriod(year, date('2026-10-03'))).toThrow(SummaryYearInvalidError);
  });

  it.each([2000, 2100])('accepts the year %s', (year) => {
    expect(() => annualSummaryPeriod(year, date('2100-12-31'))).not.toThrow();
  });
});

describe('computeAnnualSummary', () => {
  it('has the rows decided on 2026-10-03, in order', () => {
    expect(ANNUAL_ROWS).toEqual([
      'INCOME',
      'FIXED_EXPENSE',
      'VARIABLE_EXPENSE',
      'EXPENSE',
      'SAVING',
      'INVESTMENT',
      'DEBT',
      'BALANCE',
    ]);
  });

  it('has nothing to say about a year without movements', () => {
    expect(summary()).toEqual({ year: 2025, currencies: [] });
  });

  it('puts each month in its column, January and December included, with totals', () => {
    const result = summary({
      byDay: [
        day('2025-01-01', 'INCOME', pen('3000.00')),
        day('2025-01-31', 'VARIABLE_EXPENSE', pen('100.00')),
        day('2025-01-15', 'VARIABLE_EXPENSE', pen('50.50')),
        day('2025-06-10', 'FIXED_EXPENSE', pen('1000.00')),
        day('2025-12-31', 'SAVING', pen('400.00')),
        day('2025-12-01', 'INVESTMENT', pen('100.00')),
        day('2025-03-05', 'DEBT', pen('80.00')),
      ],
    });

    expect(plainRow(result, 'INCOME')).toEqual({
      months: ['3000.00', ...Array.from({ length: 11 }, () => '0.00')],
      total: '3000.00',
    });
    expect(plainRow(result, 'VARIABLE_EXPENSE').months?.[0]).toBe('150.50');
    expect(plainRow(result, 'FIXED_EXPENSE').months?.[5]).toBe('1000.00');
    // Gasto = fijo + variable, mes a mes.
    expect(plainRow(result, 'EXPENSE')).toMatchObject({ total: '1150.50' });
    expect(plainRow(result, 'EXPENSE').months?.slice(0, 6)).toEqual([
      '150.50',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '1000.00',
    ]);
    expect(plainRow(result, 'SAVING').months?.[11]).toBe('400.00');
    expect(plainRow(result, 'INVESTMENT').months?.[11]).toBe('100.00');
    expect(plainRow(result, 'DEBT').months?.[2]).toBe('80.00');
    // Saldo: lo que entró menos todo lo demás.
    expect(plainRow(result, 'BALANCE')).toEqual({
      months: [
        '2849.50',
        '0.00',
        '-80.00',
        '0.00',
        '0.00',
        '-1000.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '-500.00',
      ],
      total: '1269.50',
    });
    // (400 + 100) / 3000: el ahorro incluye la inversión.
    expect(result.currencies[0]?.savingsRate?.toString()).toMatch(/^16\.666666/u);
  });

  it('leaves the months that have not come empty, not in zero, in the year in course', () => {
    const result = summary({
      year: 2026,
      byDay: [day('2026-10-02', 'INCOME', pen('100.00')), day('2026-02-10', 'INCOME', pen('5.00'))],
    });

    expect(plainRow(result, 'INCOME')).toEqual({
      months: [
        '0.00',
        '5.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '100.00',
        '—',
        '—',
      ],
      total: '105.00',
    });
  });

  it('has no savings rate without income, and shows one above 100 % as it is', () => {
    const none = summary({ byDay: [day('2025-05-01', 'SAVING', pen('10.00'))] });
    const over = summary({
      byDay: [day('2025-05-01', 'INCOME', pen('10.00')), day('2025-05-02', 'SAVING', pen('15.00'))],
    });

    expect(none.currencies[0]?.savingsRate).toBeNull();
    expect(over.currencies[0]?.savingsRate?.toString()).toBe('150');
  });

  it('keeps each currency apart, soles first, never converting', () => {
    const result = summary({
      byDay: [
        day('2025-04-01', 'INCOME', usd('1000.00')),
        day('2025-04-01', 'INCOME', pen('3000.00')),
      ],
    });

    expect(result.currencies.map((entry) => entry.currency)).toEqual(['PEN', 'USD']);
    expect(plainRow(result, 'INCOME', 1).total).toBe('1000.00');
    expect(result.currencies[1]?.rows.every((row) => row.total.currency === 'USD')).toBe(true);
  });

  it('ignores days outside the year asked', () => {
    const result = summary({
      byDay: [day('2024-12-31', 'INCOME', pen('99.00')), day('2026-01-01', 'INCOME', pen('99.00'))],
    });

    expect(result.currencies).toEqual([]);
  });

  it('splits the expense of the year by parent category, like the dashboard', () => {
    const result = summary({
      byDay: [day('2025-02-01', 'VARIABLE_EXPENSE', pen('100.00'))],
      byCategory: [
        { categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('75.00') },
        { categoryId: 'rent', type: 'FIXED_EXPENSE', amount: pen('25.00') },
        { categoryId: 'salary', type: 'INCOME', amount: pen('999.00') },
      ],
    });

    expect(
      result.currencies[0]?.distribution.map((slice) => [
        slice.categoryId,
        slice.amount.toFixed(),
        slice.share?.toString(),
      ]),
    ).toEqual([
      ['food', '75.00', '75'],
      ['rent', '25.00', '25'],
    ]);
  });

  it('splits the expense of each currency apart', () => {
    const result = summary({
      byDay: [
        day('2025-02-01', 'VARIABLE_EXPENSE', pen('10.00')),
        day('2025-02-01', 'VARIABLE_EXPENSE', usd('40.00')),
      ],
      byCategory: [
        { categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('10.00') },
        { categoryId: 'trip', type: 'VARIABLE_EXPENSE', amount: usd('40.00') },
      ],
    });

    expect(
      result.currencies.map((entry) =>
        entry.distribution.map((slice) => `${String(slice.categoryId)} ${slice.amount.toFixed()}`),
      ),
    ).toEqual([['food 10.00'], ['trip 40.00']]);
  });
});
