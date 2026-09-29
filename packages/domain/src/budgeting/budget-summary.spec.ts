import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { type BudgetedAmount, type RealAmount, summarizeBudget } from './budget-summary.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');

function line(
  categoryId: string,
  planned: Money,
  type: BudgetedAmount['type'] = 'VARIABLE_EXPENSE',
): BudgetedAmount {
  return { categoryId, type, planned };
}

function real(
  categoryId: string,
  amount: Money,
  type: RealAmount['type'] = 'VARIABLE_EXPENSE',
): RealAmount {
  return { categoryId, type, amount };
}

/** Los montos de un reporte como texto, para comparar sin depender de cómo guarda `Money` sus decimales. */
function amounts(report: ReturnType<typeof summarizeBudget>[number]) {
  return {
    type: report.type,
    currency: report.currency,
    lines: report.lines.map((entry) => [
      entry.categoryId,
      entry.planned.toFixed(),
      entry.actual.toFixed(),
      entry.status,
    ]),
    unbudgeted: report.unbudgeted.map((entry) => [entry.categoryId, entry.amount.toFixed()]),
    total: [
      report.total.planned.toFixed(),
      report.total.actual.toFixed(),
      report.total.difference.toFixed(),
      report.total.status,
    ],
  };
}

describe('summarizeBudget', () => {
  it('puts the actual next to each line and adds them up by type', () => {
    const reports = summarizeBudget(
      [line('food', pen('800')), line('transport', pen('200'))],
      [real('food', pen('550.40')), real('transport', pen('230'))],
    );

    expect(reports.map(amounts)).toEqual([
      {
        type: 'VARIABLE_EXPENSE',
        currency: 'PEN',
        lines: [
          ['food', '800.00', '550.40', 'WITHIN'],
          ['transport', '200.00', '230.00', 'EXCEEDED'],
        ],
        unbudgeted: [],
        total: ['1000.00', '780.40', '219.60', 'WITHIN'],
      },
    ]);
  });

  it('shows a line with nothing spent yet', () => {
    const [report] = summarizeBudget([line('food', pen('800'))], []);

    expect(report && amounts(report).lines).toEqual([['food', '800.00', '0.00', 'WITHIN']]);
  });

  it('puts what was spent without a line in «Sin presupuesto», biggest first, and counts it in the total', () => {
    const [report] = summarizeBudget(
      [line('food', pen('800'))],
      [
        real('food', pen('100')),
        real('movies', pen('45')),
        real('gifts', pen('120')),
        real('movies', pen('5')),
      ],
    );

    expect(report && amounts(report)).toMatchObject({
      unbudgeted: [
        ['gifts', '120.00'],
        ['movies', '50.00'],
      ],
      total: ['800.00', '270.00', '530.00', 'WITHIN'],
    });
  });

  it('breaks ties among unbudgeted categories by id, so the order never jumps', () => {
    const [report] = summarizeBudget([], [real('b', pen('10')), real('a', pen('10'))]);

    expect(report?.unbudgeted.map((entry) => entry.categoryId)).toEqual(['a', 'b']);
  });

  it('reports a type that only has unbudgeted spending, as exceeding a zero budget', () => {
    const [report] = summarizeBudget([], [real('movies', pen('45'))]);

    expect(report && amounts(report)).toMatchObject({
      lines: [],
      total: ['0.00', '45.00', '-45.00', 'EXCEEDED'],
    });
    expect(report?.total.executed).toBeNull();
  });

  it('never mixes currencies: a line in soles ignores dollars, which go to their own report', () => {
    const reports = summarizeBudget(
      [line('food', pen('800')), line('food', usd('50'))],
      [real('food', pen('300')), real('food', usd('60')), real('travel', usd('10'))],
    );

    expect(reports.map(amounts)).toEqual([
      expect.objectContaining({
        currency: 'PEN',
        lines: [['food', '800.00', '300.00', 'WITHIN']],
        unbudgeted: [],
      }),
      expect.objectContaining({
        currency: 'USD',
        lines: [['food', '50.00', '60.00', 'EXCEEDED']],
        unbudgeted: [['travel', '10.00']],
        total: ['50.00', '70.00', '-20.00', 'EXCEEDED'],
      }),
    ]);
  });

  it('reads goals the other way round, also in the totals', () => {
    const [report] = summarizeBudget(
      [line('salary', pen('4000'), 'INCOME')],
      [real('salary', pen('4200'), 'INCOME'), real('bonus', pen('300'), 'INCOME')],
    );

    expect(report && amounts(report)).toMatchObject({
      type: 'INCOME',
      lines: [['salary', '4000.00', '4200.00', 'MET']],
      total: ['4000.00', '4500.00', '500.00', 'MET'],
    });
  });

  it('orders the reports as the glossary orders the types, soles before dollars', () => {
    const reports = summarizeBudget(
      [
        line('loan', pen('300'), 'DEBT'),
        line('rent', usd('500'), 'FIXED_EXPENSE'),
        line('rent2', pen('1500'), 'FIXED_EXPENSE'),
      ],
      [real('salary', pen('4000'), 'INCOME')],
    );

    expect(reports.map((report) => `${report.type} ${report.currency}`)).toEqual([
      'INCOME PEN',
      'FIXED_EXPENSE PEN',
      'FIXED_EXPENSE USD',
      'DEBT PEN',
    ]);
  });

  it('keeps the lines in the order they were given', () => {
    const [report] = summarizeBudget([line('b', pen('1')), line('a', pen('2'))], []);

    expect(report?.lines.map((entry) => entry.categoryId)).toEqual(['b', 'a']);
  });

  it('has nothing to say about an empty month', () => {
    expect(summarizeBudget([], [])).toEqual([]);
  });
});
