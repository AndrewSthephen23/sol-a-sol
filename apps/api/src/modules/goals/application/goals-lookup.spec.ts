import { FixedClock, LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeGoalContributionRepository } from '../ports/goal-contribution-repository.fake.js';
import { FakeGoalRepository } from '../ports/goal-repository.fake.js';
import { FakeGoalTransactionsReader } from '../ports/transactions-reader.fake.js';
import { GoalsLookup } from './goals-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const date = (text: string) => LocalDate.parse(text);

describe('GoalsLookup', () => {
  let goals: FakeGoalRepository;
  let contributions: FakeGoalContributionRepository;
  let transactions: FakeGoalTransactionsReader;
  let lookup: GoalsLookup;

  async function goal(userId: string, name: string) {
    return goals.create(userId, {
      name,
      target: Money.of('1200.00', 'PEN'),
      startDate: date('2026-01-01'),
      endDate: date('2026-12-31'),
    });
  }

  beforeEach(() => {
    goals = new FakeGoalRepository();
    contributions = new FakeGoalContributionRepository();
    transactions = new FakeGoalTransactionsReader();
    lookup = new GoalsLookup(
      goals,
      contributions,
      transactions,
      FixedClock.at('2026-10-03T15:00:00Z'),
    );
  });

  it('gives each goal with the movements that count, links read from their transaction today', async () => {
    const trip = await goal(ANA, 'Viaje');
    transactions
      .with(ANA, {
        id: 'saving',
        date: date('2026-09-10'),
        type: 'SAVING',
        amount: Money.of('500.00', 'PEN'),
        description: 'Ahorro',
      })
      .with(
        ANA,
        {
          id: 'gone',
          date: date('2026-09-11'),
          type: 'SAVING',
          amount: Money.of('70.00', 'PEN'),
          description: 'Ahorro borrado',
        },
        true,
      );
    await contributions.create(ANA, {
      goalId: trip.id,
      source: 'MANUAL',
      kind: 'WITHDRAWAL',
      amount: '50.00',
      date: date('2026-09-20'),
    });
    await contributions.create(ANA, {
      goalId: trip.id,
      source: 'TRANSACTION',
      transactionId: 'saving',
    });
    await contributions.create(ANA, {
      goalId: trip.id,
      source: 'TRANSACTION',
      transactionId: 'gone',
    });

    const [found] = await lookup.goalsWithMovements(ANA);

    expect(found).toMatchObject({ goalId: trip.id, name: 'Viaje', archived: false });
    expect(found?.target.toFixed()).toBe('1200.00');
    expect(
      found?.contributions.map(
        (movement) => `${movement.kind} ${movement.amount.toFixed()} ${movement.date.toString()}`,
      ),
    ).toEqual(['WITHDRAWAL 50.00 2026-09-20', 'CONTRIBUTION 500.00 2026-09-10']);
  });

  it('includes archived goals, saying so, and never the goals of another account', async () => {
    const old = await goal(ANA, 'Vieja');
    await goals.update(ANA, old.id, { archivedAt: new Date('2026-06-01T00:00:00Z') });
    await goal(BRUNO, 'De Bruno');

    const found = await lookup.goalsWithMovements(ANA);

    expect(found.map((entry) => [entry.name, entry.archived])).toEqual([['Vieja', true]]);
  });
});
