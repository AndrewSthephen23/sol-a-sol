import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import {
  buildMonthlyDashboard,
  type CurrencyDashboard,
  DISTRIBUTION_SLICES,
  type MonthlyDashboardInput,
} from './monthly-dashboard.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const day = (text: string) => LocalDate.parse(text);

function input(overrides: Partial<MonthlyDashboardInput> = {}): MonthlyDashboardInput {
  return {
    year: 2026,
    month: 9,
    today: day('2026-10-15'),
    byCategory: [],
    byDay: [],
    ...overrides,
  };
}

function spent(categoryId: string, amount: Money, type: TransactionType = 'VARIABLE_EXPENSE') {
  return { categoryId, type, amount };
}

function onDay(date: string, amount: Money, type: TransactionType = 'VARIABLE_EXPENSE') {
  return { date: day(date), type, amount };
}

/** Un tablero como texto, para comparar sin depender de cómo guarda `Money` sus decimales. */
function plain(dashboard: CurrencyDashboard) {
  return {
    currency: dashboard.currency,
    kpis: Object.fromEntries(
      Object.entries(dashboard.kpis).map(([key, value]) => [key, value.toFixed()]),
    ),
    daily: dashboard.daily.map((entry) => [entry.date.toString(), entry.amount.toFixed()]),
    distribution: dashboard.distribution.map((slice) => [
      slice.categoryId,
      slice.amount.toFixed(),
      slice.share?.toFixed(2) ?? null,
    ]),
    byType: dashboard.byType.map((table) => ({
      type: table.type,
      total: table.total.toFixed(),
      categories: table.categories.map((row) => [row.categoryId, row.amount.toFixed()]),
    })),
  };
}

describe('buildMonthlyDashboard', () => {
  it('has nothing to show for a month without movements', () => {
    expect(buildMonthlyDashboard(input())).toEqual([]);
  });

  it('adds up the KPIs of the month with the rules of the whole product', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({
        byCategory: [
          spent('salary', pen('4000'), 'INCOME'),
          spent('rent', pen('1500'), 'FIXED_EXPENSE'),
          spent('food', pen('500'), 'VARIABLE_EXPENSE'),
          spent('fund', pen('300'), 'SAVING'),
          spent('stocks', pen('200'), 'INVESTMENT'),
          spent('loan', pen('100'), 'DEBT'),
        ],
      }),
    );

    expect(dashboard && plain(dashboard).kpis).toEqual({
      income: '4000.00',
      expense: '2000.00',
      saving: '500.00',
      debt: '100.00',
      balance: '1400.00',
    });
  });

  it('draws one bar per day of a past month, zero on the days without spending', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({
        byCategory: [spent('food', pen('30'))],
        byDay: [
          onDay('2026-09-01', pen('10')),
          onDay('2026-09-01', pen('5'), 'FIXED_EXPENSE'),
          onDay('2026-09-30', pen('15')),
        ],
      }),
    );
    const daily = dashboard ? plain(dashboard).daily : [];

    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual(['2026-09-01', '15.00']);
    expect(daily[1]).toEqual(['2026-09-02', '0.00']);
    expect(daily[29]).toEqual(['2026-09-30', '15.00']);
  });

  it('counts only spending in the bars: fixed and variable, not income, saving nor debt', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({
        byCategory: [spent('salary', pen('4000'), 'INCOME')],
        byDay: [
          onDay('2026-09-01', pen('4000'), 'INCOME'),
          onDay('2026-09-01', pen('300'), 'SAVING'),
          onDay('2026-09-01', pen('100'), 'DEBT'),
        ],
      }),
    );

    expect(dashboard && plain(dashboard).daily[0]).toEqual(['2026-09-01', '0.00']);
  });

  it.each([
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])('draws every day of %i-%i: %i bars', (year, month, days) => {
    const [dashboard] = buildMonthlyDashboard(
      input({ year, month, today: day('2030-01-01'), byCategory: [spent('food', pen('1'))] }),
    );

    expect(dashboard?.daily).toHaveLength(days);
  });

  it('stops at today in the current month', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({ today: day('2026-09-12'), byCategory: [spent('food', pen('1'))] }),
    );

    expect(dashboard?.daily.map((entry) => entry.date.toString()).at(-1)).toBe('2026-09-12');
    expect(dashboard?.daily).toHaveLength(12);
  });

  it('has no bars for a month that has not started', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({ today: day('2026-08-31'), byCategory: [spent('food', pen('1'))] }),
    );

    expect(dashboard?.daily).toEqual([]);
  });

  it('splits the spending by category, biggest first, with its share of the total', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({
        byCategory: [
          spent('food', pen('600')),
          spent('rent', pen('300'), 'FIXED_EXPENSE'),
          spent('movies', pen('100')),
          spent('salary', pen('4000'), 'INCOME'),
        ],
      }),
    );

    expect(dashboard && plain(dashboard).distribution).toEqual([
      ['food', '600.00', '60.00'],
      ['rent', '300.00', '30.00'],
      ['movies', '100.00', '10.00'],
    ]);
  });

  it(`keeps ${String(DISTRIBUTION_SLICES)} slices and puts the rest in «Otras»`, () => {
    const categories = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) =>
      spent(id, pen(String(80 - index * 10))),
    );

    const [dashboard] = buildMonthlyDashboard(input({ byCategory: categories }));
    const slices = dashboard ? plain(dashboard).distribution : [];

    expect(slices).toHaveLength(DISTRIBUTION_SLICES + 1);
    // 80 + 70 + … + 10 = 360: «a» es 80/360 y «Otras» (20 + 10) es 30/360.
    expect(slices.slice(0, 2)).toEqual([
      ['a', '80.00', '22.22'],
      ['b', '70.00', '19.44'],
    ]);
    expect(slices.at(-1)).toEqual([null, '30.00', '8.33']);
  });

  it(`does not add «Otras» with exactly ${String(DISTRIBUTION_SLICES)} categories`, () => {
    const categories = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => spent(id, pen('10')));

    const [dashboard] = buildMonthlyDashboard(input({ byCategory: categories }));

    expect(dashboard?.distribution.map((slice) => slice.categoryId)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('breaks ties by category, so the order never jumps', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({ byCategory: [spent('b', pen('10')), spent('a', pen('10'))] }),
    );

    expect(dashboard?.distribution.map((slice) => slice.categoryId)).toEqual(['a', 'b']);
  });

  it('adds up a category that comes in several entries', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({ byCategory: [spent('food', pen('10')), spent('food', pen('5'))] }),
    );

    expect(dashboard && plain(dashboard).distribution).toEqual([['food', '15.00', '100.00']]);
  });

  it('has no slices without spending', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({ byCategory: [spent('salary', pen('4000'), 'INCOME')] }),
    );

    expect(dashboard?.distribution).toEqual([]);
  });

  it('lists each type with its categories, biggest first', () => {
    const [dashboard] = buildMonthlyDashboard(
      input({
        byCategory: [
          spent('movies', pen('100')),
          spent('food', pen('600')),
          spent('salary', pen('4000'), 'INCOME'),
        ],
      }),
    );

    expect(dashboard && plain(dashboard).byType).toEqual([
      { type: 'INCOME', total: '4000.00', categories: [['salary', '4000.00']] },
      {
        type: 'VARIABLE_EXPENSE',
        total: '700.00',
        categories: [
          ['food', '600.00'],
          ['movies', '100.00'],
        ],
      },
    ]);
  });

  it('keeps every currency apart, soles first, and never converts', () => {
    const dashboards = buildMonthlyDashboard(
      input({
        byCategory: [spent('food', usd('20')), spent('food', pen('50'))],
        byDay: [onDay('2026-09-01', usd('20')), onDay('2026-09-01', pen('50'))],
      }),
    );

    expect(dashboards.map((dashboard) => dashboard.currency)).toEqual(['PEN', 'USD']);
    expect(dashboards.map((dashboard) => dashboard.daily[0]?.amount.toFixed())).toEqual([
      '50.00',
      '20.00',
    ]);
    expect(dashboards.map((dashboard) => dashboard.kpis.expense.toFixed())).toEqual([
      '50.00',
      '20.00',
    ]);
  });
});
