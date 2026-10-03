import { describe, expect, it } from 'vitest';

import { InvalidLocalDateError, LocalDate } from '../time/local-date.js';
import { CurrencyMismatchError, Money } from '../money/money.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import type { GoalMovement } from '../goals/goal-progress.js';
import {
  computeMonthlySummary,
  type MonthlySummaryInput,
  monthlySummaryPeriods,
  SummaryMonthInFutureError,
  TOP_ITEMS,
  type SummaryGoalInput,
} from './monthly-summary.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const date = (text: string) => LocalDate.parse(text);
const row = (categoryId: string, type: TransactionType, amount: Money) => ({
  categoryId,
  type,
  amount,
});
const merchant = (
  name: string,
  amount: Money,
  count = 1,
  type: TransactionType = 'VARIABLE_EXPENSE',
) => ({
  merchant: name,
  type,
  amount,
  count,
});

/** Setiembre de 2026, ya cerrado (hoy es 3 de octubre). */
function summary(overrides: Partial<Omit<MonthlySummaryInput, 'periods'>> = {}) {
  return computeMonthlySummary({
    periods: monthlySummaryPeriods(2026, 9, date('2026-10-03')),
    current: { byCategory: [], byMerchant: [] },
    previous: { byCategory: [] },
    ...overrides,
  });
}

describe('monthlySummaryPeriods', () => {
  it('compares a closed month with the whole previous month', () => {
    const periods = monthlySummaryPeriods(2026, 9, date('2026-10-03'));

    expect(periods.year).toBe(2026);
    expect(periods.month).toBe(9);
    expect(periods.current.from.toString()).toBe('2026-09-01');
    expect(periods.current.to.toString()).toBe('2026-09-30');
    expect(periods.previous.from.toString()).toBe('2026-08-01');
    expect(periods.previous.to.toString()).toBe('2026-08-31');
    expect(periods.complete).toBe(true);
  });

  it('compares the month in course with the previous one up to the same day (decision 8)', () => {
    const periods = monthlySummaryPeriods(2026, 9, date('2026-09-15'));

    expect(periods.current.to.toString()).toBe('2026-09-15');
    expect(periods.previous.from.toString()).toBe('2026-08-01');
    expect(periods.previous.to.toString()).toBe('2026-08-15');
    expect(periods.complete).toBe(false);
  });

  it('takes the last day of a shorter previous month', () => {
    const periods = monthlySummaryPeriods(2026, 3, date('2026-03-30'));

    expect(periods.previous.to.toString()).toBe('2026-02-28');
  });

  it('crosses the new year', () => {
    const periods = monthlySummaryPeriods(2026, 1, date('2026-01-10'));

    expect(periods.previous.from.toString()).toBe('2025-12-01');
    expect(periods.previous.to.toString()).toBe('2025-12-10');
  });

  it('treats the last day of the month as the month in course', () => {
    const periods = monthlySummaryPeriods(2026, 9, date('2026-09-30'));

    expect(periods.current.to.toString()).toBe('2026-09-30');
    expect(periods.previous.to.toString()).toBe('2026-08-30');
    expect(periods.complete).toBe(false);
  });

  it('starts a month on its first day', () => {
    const periods = monthlySummaryPeriods(2026, 10, date('2026-10-01'));

    expect(periods.current.from.toString()).toBe('2026-10-01');
    expect(periods.current.to.toString()).toBe('2026-10-01');
  });

  it('refuses a month that has not started', () => {
    expect(() => monthlySummaryPeriods(2026, 11, date('2026-10-31'))).toThrow(
      SummaryMonthInFutureError,
    );
    expect(() => monthlySummaryPeriods(2026, 11, date('2026-10-31'))).toThrow(
      expect.objectContaining({
        code: 'SUMMARY_MONTH_IN_FUTURE',
        message: 'There is no summary of 2026-11 yet: it has not started.',
      }) as Error,
    );
  });

  it('names the month with two digits', () => {
    expect(() => monthlySummaryPeriods(2027, 3, date('2026-10-03'))).toThrow(
      'There is no summary of 2027-03 yet: it has not started.',
    );
  });

  it('refuses a month that does not exist', () => {
    expect(() => monthlySummaryPeriods(2026, 13, date('2026-10-03'))).toThrow(
      InvalidLocalDateError,
    );
  });
});

describe('computeMonthlySummary', () => {
  it('uses the tops decided on 2026-10-03', () => {
    expect(TOP_ITEMS).toBe(5);
  });

  it('has nothing to say about a month without movements', () => {
    expect(summary()).toEqual({ currencies: [] });
  });

  describe('totals and savings rate', () => {
    it('adds up each type and the balance of the month', () => {
      const [soles] = summary({
        current: {
          byCategory: [
            row('salary', 'INCOME', pen('3000.00')),
            row('rent', 'FIXED_EXPENSE', pen('1000.00')),
            row('food', 'VARIABLE_EXPENSE', pen('450.50')),
            row('savings', 'SAVING', pen('300.00')),
            row('fund', 'INVESTMENT', pen('200.00')),
            row('loan', 'DEBT', pen('100.00')),
          ],
          byMerchant: [],
        },
      }).currencies;

      expect(soles?.currency).toBe('PEN');
      expect(soles?.byType.map((entry) => [entry.type, entry.amount.toFixed()])).toEqual([
        ['INCOME', '3000.00'],
        ['FIXED_EXPENSE', '1000.00'],
        ['VARIABLE_EXPENSE', '450.50'],
        ['SAVING', '300.00'],
        ['INVESTMENT', '200.00'],
        ['DEBT', '100.00'],
      ]);
      expect(soles?.totals.expense.toFixed()).toBe('1450.50');
      expect(soles?.totals.saving.toFixed()).toBe('500.00');
      expect(soles?.totals.balance.toFixed()).toBe('949.50');
      // (300 + 200) / 3000: el ahorro incluye la inversión (decisión 9).
      expect(soles?.savingsRate?.toString()).toMatch(/^16\.666666/u);
    });

    it('has no savings rate without income', () => {
      const [soles] = summary({
        current: { byCategory: [row('savings', 'SAVING', pen('100.00'))], byMerchant: [] },
      }).currencies;

      expect(soles?.savingsRate).toBeNull();
    });

    it('shows a savings rate above 100 % as it is', () => {
      const [soles] = summary({
        current: {
          byCategory: [
            row('salary', 'INCOME', pen('100.00')),
            row('savings', 'SAVING', pen('150.00')),
          ],
          byMerchant: [],
        },
      }).currencies;

      expect(soles?.savingsRate?.toString()).toBe('150');
    });

    it('keeps each currency apart, soles first, never converting', () => {
      const { currencies } = summary({
        current: {
          byCategory: [
            row('salary-usd', 'INCOME', usd('1000.00')),
            row('salary', 'INCOME', pen('3000.00')),
            row('savings-usd', 'SAVING', usd('100.00')),
          ],
          byMerchant: [],
        },
      });

      expect(currencies.map((entry) => entry.currency)).toEqual(['PEN', 'USD']);
      expect(currencies[1]?.totals.income.toFixed()).toBe('1000.00');
      expect(currencies[1]?.savingsRate?.toString()).toBe('10');
      expect(currencies[0]?.savingsRate?.toString()).toBe('0');
    });

    it('shows a currency that only moved in the previous month, at zero now', () => {
      const [dollars] = summary({
        previous: { byCategory: [row('trip', 'VARIABLE_EXPENSE', usd('80.00'))] },
      }).currencies;

      expect(dollars?.currency).toBe('USD');
      expect(dollars?.totals.expense.toFixed()).toBe('0.00');
      expect(dollars?.byType[2]?.previous.toFixed()).toBe('80.00');
    });
  });

  describe('comparison with the previous month (decision 10)', () => {
    it('gives the difference and the exact percentage of each type', () => {
      const [soles] = summary({
        current: { byCategory: [row('food', 'VARIABLE_EXPENSE', pen('450.00'))], byMerchant: [] },
        previous: { byCategory: [row('food', 'VARIABLE_EXPENSE', pen('300.00'))] },
      }).currencies;
      const variable = soles?.byType.find((entry) => entry.type === 'VARIABLE_EXPENSE');

      expect(variable?.previous.toFixed()).toBe('300.00');
      expect(variable?.difference.toFixed()).toBe('150.00');
      expect(variable?.change?.toString()).toBe('50');
    });

    it('has no percentage with a zero base, but still the difference', () => {
      const [soles] = summary({
        current: { byCategory: [row('fund', 'INVESTMENT', pen('200.00'))], byMerchant: [] },
      }).currencies;
      const investment = soles?.byType.find((entry) => entry.type === 'INVESTMENT');

      expect(investment?.difference.toFixed()).toBe('200.00');
      expect(investment?.change).toBeNull();
    });

    it('gives -100 % for a type that disappears', () => {
      const [soles] = summary({
        current: { byCategory: [row('food', 'VARIABLE_EXPENSE', pen('10.00'))], byMerchant: [] },
        previous: {
          byCategory: [
            row('loan', 'DEBT', pen('50.00')),
            row('food', 'VARIABLE_EXPENSE', pen('4.00')),
          ],
        },
      }).currencies;
      const debt = soles?.byType.find((entry) => entry.type === 'DEBT');
      const variable = soles?.byType.find((entry) => entry.type === 'VARIABLE_EXPENSE');

      expect(variable?.previous.toFixed()).toBe('4.00');

      expect(debt?.difference.toFixed()).toBe('-50.00');
      expect(debt?.change?.toString()).toBe('-100');
    });

    it('compares each parent category present in either month, adding what comes twice', () => {
      const [soles] = summary({
        current: {
          byCategory: [
            row('food', 'VARIABLE_EXPENSE', pen('100.00')),
            row('food', 'VARIABLE_EXPENSE', pen('20.00')),
            row('salary', 'INCOME', pen('3000.00')),
          ],
          byMerchant: [],
        },
        previous: {
          byCategory: [
            row('food', 'VARIABLE_EXPENSE', pen('80.00')),
            row('taxi', 'VARIABLE_EXPENSE', pen('30.00')),
          ],
        },
      }).currencies;

      expect(
        soles?.byCategory.map((entry) => [
          entry.categoryId,
          entry.type,
          entry.amount.toFixed(),
          entry.previous.toFixed(),
          entry.change?.toString() ?? null,
        ]),
      ).toEqual([
        ['salary', 'INCOME', '3000.00', '0.00', null],
        ['food', 'VARIABLE_EXPENSE', '120.00', '80.00', '50'],
        ['taxi', 'VARIABLE_EXPENSE', '0.00', '30.00', '-100'],
      ]);
    });

    it('orders categories by type, then by amount now, then by id', () => {
      const [soles] = summary({
        current: {
          byCategory: [
            row('b', 'VARIABLE_EXPENSE', pen('10.00')),
            row('a', 'VARIABLE_EXPENSE', pen('10.00')),
            row('c', 'VARIABLE_EXPENSE', pen('99.00')),
            row('rent', 'FIXED_EXPENSE', pen('1.00')),
          ],
          byMerchant: [],
        },
      }).currencies;

      expect(soles?.byCategory.map((entry) => entry.categoryId)).toEqual(['rent', 'c', 'a', 'b']);
    });
  });

  it('orders the categories that only moved before by id, at zero now', () => {
    const [soles] = summary({
      previous: {
        byCategory: [
          row('z', 'VARIABLE_EXPENSE', pen('50.00')),
          row('y', 'VARIABLE_EXPENSE', pen('10.00')),
        ],
      },
    }).currencies;

    expect(soles?.byCategory.map((entry) => entry.categoryId)).toEqual(['y', 'z']);
  });

  describe('top categories', () => {
    it('ranks up to five expense categories, fixed and variable, with their share', () => {
      const [soles] = summary({
        current: {
          byCategory: [
            row('rent', 'FIXED_EXPENSE', pen('600.00')),
            row('food', 'VARIABLE_EXPENSE', pen('300.00')),
            row('taxi', 'VARIABLE_EXPENSE', pen('50.00')),
            row('gym', 'FIXED_EXPENSE', pen('50.00')),
            row('fun', 'VARIABLE_EXPENSE', pen('40.00')),
            row('gifts', 'VARIABLE_EXPENSE', pen('10.00')),
            row('salary', 'INCOME', pen('9999.00')),
            row('savings', 'SAVING', pen('9999.00')),
          ],
          byMerchant: [],
        },
      }).currencies;

      // Gasto del mes: S/ 1,050.00.
      expect(
        soles?.topCategories.map((entry) => [
          entry.categoryId,
          entry.amount.toFixed(),
          entry.share?.toFixed(4),
        ]),
      ).toEqual([
        ['rent', '600.00', '57.1429'],
        ['food', '300.00', '28.5714'],
        // Empatadas, por id: así el orden nunca salta.
        ['gym', '50.00', '4.7619'],
        ['taxi', '50.00', '4.7619'],
        ['fun', '40.00', '3.8095'],
      ]);
    });

    it('lists fewer than five when there are fewer', () => {
      const [soles] = summary({
        current: { byCategory: [row('food', 'VARIABLE_EXPENSE', pen('30.00'))], byMerchant: [] },
      }).currencies;

      expect(soles?.topCategories).toHaveLength(1);
      expect(soles?.topCategories[0]?.share?.toString()).toBe('100');
    });
  });

  describe('top merchants (decision 11)', () => {
    it('joins merchants that only differ in accents or case, named as written most often', () => {
      const [soles] = summary({
        current: {
          byCategory: [row('food', 'VARIABLE_EXPENSE', pen('1.00'))],
          byMerchant: [
            merchant('Café Ñaña', pen('20.00'), 1),
            merchant('CAFE ÑAÑA', pen('30.00'), 3),
            merchant(' café ñaña ', pen('10.00'), 2),
            merchant(' Tambo ', pen('15.00'), 1),
          ],
        },
      }).currencies;

      expect(
        soles?.topMerchants.map((entry) => [entry.merchant, entry.amount.toFixed(), entry.count]),
      ).toEqual([
        ['CAFE ÑAÑA', '60.00', 6],
        ['Tambo', '15.00', 1],
      ]);
    });

    it('names a tie in how often it was written by the first in code order, whatever came first', () => {
      const nameOf = (entries: ReturnType<typeof merchant>[]) =>
        summary({
          current: {
            byCategory: [row('food', 'VARIABLE_EXPENSE', pen('1.00'))],
            byMerchant: entries,
          },
        }).currencies[0]?.topMerchants[0]?.merchant;

      expect(
        nameOf([
          merchant('wong', pen('5.00'), 2),
          merchant('Wong', pen('5.00'), 2),
          merchant('WONG', pen('5.00'), 1),
        ]),
      ).toBe('Wong');
      expect(nameOf([merchant('Wong', pen('5.00'), 2), merchant('wong', pen('5.00'), 2)])).toBe(
        'Wong',
      );
    });

    it('counts only expenses, leaves blank merchants out and keeps the top five', () => {
      const [soles] = summary({
        current: {
          byCategory: [row('food', 'VARIABLE_EXPENSE', pen('1.00'))],
          byMerchant: [
            merchant('Empresa', pen('9000.00'), 1, 'INCOME'),
            merchant('AFP', pen('900.00'), 1, 'SAVING'),
            merchant('   ', pen('800.00')),
            merchant('Luz del Sur', pen('100.00'), 1, 'FIXED_EXPENSE'),
            merchant('E', pen('10.00')),
            merchant('D', pen('20.00')),
            merchant('C', pen('20.00')),
            merchant('B', pen('40.00')),
            merchant('A', pen('5.00')),
          ],
        },
      }).currencies;

      expect(soles?.topMerchants.map((entry) => entry.merchant)).toEqual([
        'Luz del Sur',
        'B',
        'C',
        'D',
        'E',
      ]);
    });

    it('keeps merchants of each currency apart', () => {
      const { currencies } = summary({
        current: {
          byCategory: [
            row('shopping', 'VARIABLE_EXPENSE', usd('50.00')),
            row('shopping', 'VARIABLE_EXPENSE', pen('10.00')),
          ],
          byMerchant: [merchant('Amazon', usd('50.00')), merchant('Amazon', pen('10.00'))],
        },
      });

      expect(currencies.map((entry) => entry.topMerchants[0]?.amount.toFixed())).toEqual([
        '10.00',
        '50.00',
      ]);
    });
  });

  describe('budget (decision 12)', () => {
    it('is left out when the budget module does not send it', () => {
      expect(summary()).not.toHaveProperty('budget');
    });

    it('says there is no budget when the month has no limit lines', () => {
      expect(summary({ budget: { lines: [] } }).budget).toEqual({ status: 'NONE' });
      expect(
        summary({
          budget: { lines: [{ categoryId: 'salary', type: 'INCOME', planned: pen('3000.00') }] },
        }).budget,
      ).toEqual({ status: 'NONE' });
    });

    it('gives the executed share of the limits per currency and the exceeded lines', () => {
      const result = summary({
        current: {
          byCategory: [
            row('food', 'VARIABLE_EXPENSE', pen('500.01')),
            row('rent', 'FIXED_EXPENSE', pen('1000.00')),
            row('taxi', 'VARIABLE_EXPENSE', pen('49.99')),
            row('salary', 'INCOME', pen('100.00')),
          ],
          byMerchant: [],
        },
        budget: {
          lines: [
            { categoryId: 'food', type: 'VARIABLE_EXPENSE', planned: pen('500.00') },
            { categoryId: 'rent', type: 'FIXED_EXPENSE', planned: pen('1000.00') },
            { categoryId: 'salary', type: 'INCOME', planned: pen('3000.00') },
            { categoryId: 'trip', type: 'VARIABLE_EXPENSE', planned: usd('100.00') },
          ],
        },
      }).budget;

      if (result?.status !== 'SET') throw new Error('Expected a budget');
      expect(
        result.currencies.map((entry) => [
          entry.currency,
          entry.planned.toFixed(),
          entry.actual.toFixed(),
          entry.executed?.toString(),
        ]),
      ).toEqual([
        // Lo gastado sin partida (taxi) también cuenta contra lo planeado, como en H4.
        ['PEN', '1500.00', '1550.00', '103.3333333333333333333333333333333333333'],
        ['USD', '100.00', '0.00', '0'],
      ]);
      // La renta, justo en el límite, no está excedida; la comida, por un céntimo, sí.
      expect(result.exceeded.map((line) => [line.categoryId, line.difference.toFixed()])).toEqual([
        ['food', '-0.01'],
      ]);
    });

    it('leaves out a currency without limit lines, even with expenses', () => {
      const result = summary({
        current: { byCategory: [row('trip', 'VARIABLE_EXPENSE', usd('80.00'))], byMerchant: [] },
        budget: { lines: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', planned: pen('5.00') }] },
      }).budget;

      if (result?.status !== 'SET') throw new Error('Expected a budget');
      expect(result.currencies.map((entry) => entry.currency)).toEqual(['PEN']);
    });

    it('lists the most exceeded line first, ties by category', () => {
      const result = summary({
        current: {
          byCategory: [
            row('a', 'VARIABLE_EXPENSE', pen('20.00')),
            row('b', 'VARIABLE_EXPENSE', pen('20.00')),
            row('c', 'DEBT', pen('90.00')),
          ],
          byMerchant: [],
        },
        budget: {
          lines: [
            { categoryId: 'b', type: 'VARIABLE_EXPENSE', planned: pen('10.00') },
            { categoryId: 'a', type: 'VARIABLE_EXPENSE', planned: pen('10.00') },
            { categoryId: 'c', type: 'DEBT', planned: pen('50.00') },
          ],
        },
      }).budget;

      if (result?.status !== 'SET') throw new Error('Expected a budget');
      expect(result.exceeded.map((line) => line.categoryId)).toEqual(['c', 'a', 'b']);
    });
  });

  describe('cards (decision 13)', () => {
    const statement = (dueDate: string, remaining = '45.00') => ({
      closingDate: date('2026-09-20'),
      dueDate: date(dueDate),
      balances: [{ balance: pen('110.00'), remaining: pen(remaining) }],
    });

    it('is left out when the cards module does not send it', () => {
      expect(summary()).not.toHaveProperty('cards');
    });

    it('keeps the month charges and the statement closing in it that is due next month', () => {
      const [card] =
        summary({
          cards: [
            {
              cardId: 'visa',
              archived: false,
              charges: [pen('200.00')],
              statements: [statement('2026-10-15')],
            },
          ],
        }).cards ?? [];

      expect(card?.cardId).toBe('visa');
      expect(card?.charges.map((charge) => charge.toFixed())).toEqual(['200.00']);
      expect(card?.statement?.dueDate.toString()).toBe('2026-10-15');
      expect(card?.statement?.balances[0]?.remaining.toFixed()).toBe('45.00');
    });

    it('leaves out a statement due in the same month or later than the next one', () => {
      const cards =
        summary({
          cards: [
            {
              cardId: 'same-month',
              archived: false,
              charges: [],
              statements: [statement('2026-09-30')],
            },
            {
              cardId: 'two-months',
              archived: false,
              charges: [],
              statements: [statement('2026-11-01')],
            },
            {
              cardId: 'next-year',
              archived: false,
              charges: [],
              statements: [statement('2027-10-15')],
            },
          ],
        }).cards ?? [];

      expect(cards.map((card) => card.statement)).toEqual([null, null, null]);
    });

    it('takes the statement due next month across the new year', () => {
      const result = computeMonthlySummary({
        periods: monthlySummaryPeriods(2025, 12, date('2026-01-10')),
        current: { byCategory: [], byMerchant: [] },
        previous: { byCategory: [] },
        cards: [
          {
            cardId: 'visa',
            archived: false,
            charges: [],
            statements: [
              {
                closingDate: date('2025-12-20'),
                dueDate: date('2026-01-14'),
                balances: [{ balance: pen('10.00'), remaining: pen('0.00') }],
              },
            ],
          },
        ],
      });

      expect(result.cards?.[0]?.statement?.dueDate.toString()).toBe('2026-01-14');
    });

    it('shows an archived card only if it moved in the month', () => {
      const cards =
        summary({
          cards: [
            { cardId: 'quiet', archived: true, charges: [pen('0.00')], statements: [] },
            {
              cardId: 'quiet-statement',
              archived: true,
              charges: [],
              statements: [
                {
                  closingDate: date('2026-09-20'),
                  dueDate: date('2026-10-15'),
                  balances: [{ balance: pen('0.00'), remaining: pen('0.00') }],
                },
              ],
            },
            { cardId: 'charged', archived: true, charges: [usd('5.00')], statements: [] },
            {
              cardId: 'billed',
              archived: true,
              charges: [],
              statements: [statement('2026-10-15', '0.00')],
            },
            {
              cardId: 'billed-in-dollars',
              archived: true,
              charges: [],
              statements: [
                {
                  closingDate: date('2026-09-20'),
                  dueDate: date('2026-10-15'),
                  balances: [
                    { balance: pen('0.00'), remaining: pen('0.00') },
                    { balance: usd('10.00'), remaining: usd('10.00') },
                  ],
                },
              ],
            },
            { cardId: 'active', archived: false, charges: [], statements: [] },
          ],
        }).cards ?? [];

      expect(cards.map((card) => card.cardId)).toEqual([
        'charged',
        'billed',
        'billed-in-dollars',
        'active',
      ]);
    });
  });

  describe('goals', () => {
    const goal = (
      extra: Partial<SummaryGoalInput> & { movements?: GoalMovement[] } = {},
    ): SummaryGoalInput => ({
      goalId: 'trip',
      archived: false,
      target: pen('1200.00'),
      startDate: date('2026-01-01'),
      endDate: date('2026-12-31'),
      contributions: [],
      ...extra,
    });
    const movement = (kind: GoalMovement['kind'], amount: string, on: string): GoalMovement => ({
      kind,
      amount: pen(amount),
      date: date(on),
    });

    it('is left out when the goals module does not send it', () => {
      expect(summary()).not.toHaveProperty('goals');
    });

    it('says what was contributed in the month and the progress at its close', () => {
      const [trip] =
        summary({
          goals: [
            goal({
              contributions: [
                movement('CONTRIBUTION', '100.00', '2026-08-31'),
                movement('CONTRIBUTION', '300.00', '2026-09-01'),
                movement('WITHDRAWAL', '50.00', '2026-09-30'),
                // Del mes siguiente: ni en lo aportado ni en el avance al cierre.
                movement('CONTRIBUTION', '700.00', '2026-10-01'),
              ],
            }),
          ],
        }).goals ?? [];

      expect(trip?.goalId).toBe('trip');
      expect(trip?.contributed.toFixed()).toBe('250.00');
      expect(trip?.progress.saved.toFixed()).toBe('350.00');
      // Al cierre del 30 de setiembre se espera lo del 31 de agosto: 243 de 365 días.
      expect(trip?.progress.expectedPercentage.toString()).toMatch(/^66\.575342/u);
    });

    it('measures the month in course up to today', () => {
      const result = computeMonthlySummary({
        periods: monthlySummaryPeriods(2026, 10, date('2026-10-03')),
        current: { byCategory: [], byMerchant: [] },
        previous: { byCategory: [] },
        goals: [goal({ contributions: [movement('CONTRIBUTION', '100.00', '2026-10-02')] })],
      });

      expect(result.goals?.[0]?.contributed.toFixed()).toBe('100.00');
      expect(result.goals?.[0]?.progress.suggestedMonthly?.toFixed()).toBe('366.67');
    });

    it('shows only the goals alive in the month', () => {
      const goals =
        summary({
          goals: [
            goal({ goalId: 'archived', archived: true }),
            goal({ goalId: 'later', startDate: date('2026-10-01'), endDate: date('2027-01-01') }),
            goal({ goalId: 'ended', startDate: date('2026-01-01'), endDate: date('2026-08-31') }),
            goal({ goalId: 'starts-last-day', startDate: date('2026-09-30') }),
            goal({ goalId: 'ends-first-day', endDate: date('2026-09-01') }),
          ],
        }).goals ?? [];

      expect(goals.map((entry) => entry.goalId)).toEqual(['starts-last-day', 'ends-first-day']);
    });

    it('refuses a contribution in another currency than the goal', () => {
      expect(() =>
        summary({
          goals: [
            goal({
              contributions: [
                { kind: 'CONTRIBUTION', amount: usd('1.00'), date: date('2026-09-02') },
              ],
            }),
          ],
        }),
      ).toThrow(CurrencyMismatchError);
    });
  });
});
