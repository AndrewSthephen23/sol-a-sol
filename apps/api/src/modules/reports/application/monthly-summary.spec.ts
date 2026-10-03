import {
  FixedClock,
  InvalidLocalDateError,
  LocalDate,
  Money,
  SummaryMonthInFutureError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FakeReportActualsReader,
  FakeReportBudgetReader,
  FakeReportCardsReader,
  FakeReportCatalogReader,
  FakeReportFeatureFlags,
  FakeReportGoalsReader,
} from '../ports/report-readers.fake.js';
import { GetMonthlySummary } from './monthly-summary.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 3 de octubre de 2026 en Lima.
const NOW = '2026-10-03T15:00:00.000Z';
const date = (text: string) => LocalDate.parse(text);
const pen = (amount: string) => Money.of(amount, 'PEN');

describe('GetMonthlySummary', () => {
  let actuals: FakeReportActualsReader;
  let budget: FakeReportBudgetReader;
  let cards: FakeReportCardsReader;
  let goals: FakeReportGoalsReader;
  let flags: FakeReportFeatureFlags;
  let summary: GetMonthlySummary;

  function spent(on: string, categoryId: string, amount: string, userId = ANA, merchant?: string) {
    actuals.with({
      userId,
      date: date(on),
      categoryId,
      type: 'VARIABLE_EXPENSE',
      amount: pen(amount),
      ...(merchant === undefined ? {} : { merchant }),
    });
  }

  beforeEach(() => {
    actuals = new FakeReportActualsReader();
    const catalog = new FakeReportCatalogReader().with(ANA, 'food').with(ANA, 'delivery', 'food');
    budget = new FakeReportBudgetReader().with(ANA, 2026, 9, {
      categoryId: 'food',
      type: 'VARIABLE_EXPENSE',
      planned: pen('100.00'),
    });
    cards = new FakeReportCardsReader().with(ANA, {
      cardId: 'visa',
      label: { alias: 'Visa', institution: 'BCP', last4: '4321' },
      archived: false,
      charges: [pen('80.00')],
      statements: [],
    });
    goals = new FakeReportGoalsReader().with(ANA, {
      goalId: 'trip',
      name: 'Viaje',
      archived: false,
      target: pen('1200.00'),
      startDate: date('2026-01-01'),
      endDate: date('2026-12-31'),
      contributions: [{ kind: 'CONTRIBUTION', amount: pen('300.00'), date: date('2026-09-15') }],
    });
    flags = new FakeReportFeatureFlags();
    summary = new GetMonthlySummary(
      actuals,
      catalog,
      budget,
      cards,
      goals,
      flags,
      FixedClock.at(NOW),
    );
  });

  it('closes the month adding subcategories up into their parent, against the previous one', async () => {
    spent('2026-09-05', 'food', '60.00');
    spent('2026-09-06', 'delivery', '50.00', ANA, 'Rappi');
    spent('2026-08-20', 'delivery', '40.00');

    const { periods, summary: result } = await summary.execute({
      userId: ANA,
      year: 2026,
      month: 9,
    });
    const [soles] = result.currencies;

    expect(periods.complete).toBe(true);
    expect(
      soles?.byCategory.map((entry) => [
        entry.categoryId,
        entry.amount.toFixed(),
        entry.previous.toFixed(),
      ]),
    ).toEqual([['food', '110.00', '40.00']]);
    expect(soles?.topMerchants.map((entry) => entry.merchant)).toEqual(['Rappi']);
    if (result.budget?.status !== 'SET') throw new Error('Expected a budget');
    expect(result.budget.exceeded.map((line) => line.categoryId)).toEqual(['food']);
  });

  it('joins the cards and the goals, with their names, asking the cards for the month', async () => {
    const view = await summary.execute({ userId: ANA, year: 2026, month: 9 });

    expect(cards.asked?.from.toString()).toBe('2026-09-01');
    expect(cards.asked?.to.toString()).toBe('2026-09-30');
    expect(view.summary.cards?.map((card) => card.cardId)).toEqual(['visa']);
    expect(view.cards.get('visa')?.alias).toBe('Visa');
    expect(view.summary.goals?.[0]?.contributed.toFixed()).toBe('300.00');
    expect(view.goals.get('trip')?.name).toBe('Viaje');
  });

  it('measures the month in course up to today', async () => {
    const view = await summary.execute({ userId: ANA, year: 2026, month: 10 });

    expect(view.periods.current.to.toString()).toBe('2026-10-03');
    expect(cards.asked?.to.toString()).toBe('2026-10-03');
  });

  it.each(['budgeting', 'credit-cards', 'goals'] as const)(
    'leaves %s out without asking it when it is off',
    async (module) => {
      flags.turnOff(module);

      const view = await summary.execute({ userId: ANA, year: 2026, month: 9 });

      const section = { budgeting: 'budget', 'credit-cards': 'cards', goals: 'goals' }[module];
      const reader = { budgeting: budget, 'credit-cards': cards, goals }[module];
      expect(view.summary).not.toHaveProperty(section);
      expect(reader.calls).toBe(0);
    },
  );

  it('keeps names empty when their module is off', async () => {
    flags.turnOff('credit-cards').turnOff('goals');

    const view = await summary.execute({ userId: ANA, year: 2026, month: 9 });

    expect(view.cards.size).toBe(0);
    expect(view.goals.size).toBe(0);
  });

  it('never adds what belongs to another account', async () => {
    spent('2026-09-05', 'food', '999.00', BRUNO, 'Rappi');

    const view = await summary.execute({ userId: ANA, year: 2026, month: 9 });

    expect(view.summary.currencies).toEqual([]);
    const brunos = await summary.execute({ userId: BRUNO, year: 2026, month: 9 });
    expect(brunos.summary.cards).toEqual([]);
    expect(brunos.summary.goals).toEqual([]);
    expect(brunos.summary.budget).toEqual({ status: 'NONE' });
  });

  it('refuses a month that has not started, and one that does not exist', async () => {
    await expect(summary.execute({ userId: ANA, year: 2026, month: 11 })).rejects.toThrow(
      SummaryMonthInFutureError,
    );
    await expect(summary.execute({ userId: ANA, year: 2026, month: 13 })).rejects.toThrow(
      InvalidLocalDateError,
    );
  });
});
