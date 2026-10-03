import {
  FixedClock,
  GoalEndNotAfterStartError,
  GoalTargetNotPositiveError,
  InvalidAmountError,
  LocalDate,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { GoalNameTakenError, GoalNotFoundError } from '../domain/errors.js';
import { FakeGoalContributionRepository } from '../ports/goal-contribution-repository.fake.js';
import type { NewGoal } from '../ports/goal-repository.js';
import { FakeGoalRepository } from '../ports/goal-repository.fake.js';
import { FakeGoalTransactionsReader } from '../ports/transactions-reader.fake.js';
import { CreateGoal, ListGoals, UpdateGoal } from './goals.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 2026-10-03 en Lima.
const NOW = new Date('2026-10-03T17:00:00.000Z');
const date = (text: string) => LocalDate.parse(text);

const TRIP: NewGoal = {
  name: 'Viaje a Cusco',
  target: Money.of('1200.00', 'PEN'),
  startDate: date('2026-01-01'),
  endDate: date('2026-12-31'),
};

describe('goal use cases', () => {
  let goals: FakeGoalRepository;
  let contributions: FakeGoalContributionRepository;
  let transactions: FakeGoalTransactionsReader;
  let clock: FixedClock;
  let list: ListGoals;
  let create: CreateGoal;
  let update: UpdateGoal;

  beforeEach(() => {
    goals = new FakeGoalRepository();
    contributions = new FakeGoalContributionRepository();
    transactions = new FakeGoalTransactionsReader();
    clock = FixedClock.at(NOW);
    list = new ListGoals(goals, contributions, transactions, clock);
    create = new CreateGoal(goals, transactions, clock);
    update = new UpdateGoal(goals, contributions, transactions, clock);
  });

  describe('CreateGoal', () => {
    it('creates a goal with its progress from zero', async () => {
      const view = await create.execute(ANA, TRIP);

      expect(view.goal).toMatchObject({ name: 'Viaje a Cusco', archivedAt: null });
      expect(view.progress.saved.toFixed()).toBe('0.00');
      // Octubre, noviembre y diciembre: S/ 400.00 al mes.
      expect(view.progress.suggestedMonthly?.toFixed()).toBe('400.00');
      expect(view.contributions).toEqual([]);
    });

    it('refuses a target of zero', async () => {
      await expect(
        create.execute(ANA, { ...TRIP, target: Money.of('0.00', 'PEN') }),
      ).rejects.toThrow(GoalTargetNotPositiveError);
      await expect(list.execute(ANA, { includeArchived: true })).resolves.toEqual([]);
    });

    it('refuses an end before the start', async () => {
      await expect(create.execute(ANA, { ...TRIP, endDate: date('2025-12-31') })).rejects.toThrow(
        GoalEndNotAfterStartError,
      );
    });

    it('refuses a name another goal of the account already has, ignoring case', async () => {
      await create.execute(ANA, TRIP);

      await expect(create.execute(ANA, { ...TRIP, name: 'VIAJE A CUSCO' })).rejects.toThrow(
        GoalNameTakenError,
      );
    });

    it('lets another account use the same name', async () => {
      await create.execute(ANA, TRIP);

      await expect(create.execute(BRUNO, TRIP)).resolves.toMatchObject({});
    });
  });

  describe('ListGoals', () => {
    it('lists only the goals of the account, with their progress', async () => {
      const trip = await create.execute(ANA, TRIP);
      await create.execute(BRUNO, { ...TRIP, name: 'Laptop' });
      await contributions.create(ANA, {
        goalId: trip.goal.id,
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: '300.00',
        date: date('2026-09-15'),
      });

      const views = await list.execute(ANA, { includeArchived: false });

      expect(views.map((view) => view.goal.name)).toEqual(['Viaje a Cusco']);
      expect(views[0]?.progress.saved.toFixed()).toBe('300.00');
    });

    it('leaves the archived ones out unless asked for', async () => {
      const trip = await create.execute(ANA, TRIP);
      await create.execute(ANA, { ...TRIP, name: 'Laptop' });
      await update.execute(ANA, trip.goal.id, { archived: true });

      const active = await list.execute(ANA, { includeArchived: false });
      const all = await list.execute(ANA, { includeArchived: true });

      expect(active.map((view) => view.goal.name)).toEqual(['Laptop']);
      expect(all.map((view) => view.goal.name)).toEqual(['Viaje a Cusco', 'Laptop']);
    });
  });

  describe('UpdateGoal', () => {
    it('changes the target in the goal currency and recalculates the progress', async () => {
      const trip = await create.execute(ANA, TRIP);

      const view = await update.execute(ANA, trip.goal.id, { targetAmount: '1500.00' });

      expect(view.goal.target.equals(Money.of('1500.00', 'PEN'))).toBe(true);
      expect(view.progress.suggestedMonthly?.toFixed()).toBe('500.00');
    });

    it('keeps the progress following its contributions after changing the dates', async () => {
      const trip = await create.execute(ANA, TRIP);
      await contributions.create(ANA, {
        goalId: trip.goal.id,
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: '200.00',
        date: date('2026-09-15'),
      });

      const view = await update.execute(ANA, trip.goal.id, {
        name: 'Viaje a Arequipa',
        endDate: date('2027-03-31'),
      });

      expect(view.goal.name).toBe('Viaje a Arequipa');
      expect(view.progress.saved.toFixed()).toBe('200.00');
      // S/ 1,000.00 de octubre a marzo: 166.666… → 166.67.
      expect(view.progress.suggestedMonthly?.toFixed()).toBe('166.67');
    });

    it('checks the goal as it would be', async () => {
      const trip = await create.execute(ANA, TRIP);

      await expect(
        update.execute(ANA, trip.goal.id, { startDate: date('2027-01-01') }),
      ).rejects.toThrow(GoalEndNotAfterStartError);
      await expect(update.execute(ANA, trip.goal.id, { targetAmount: '-5.00' })).rejects.toThrow(
        GoalTargetNotPositiveError,
      );
    });

    it('refuses a target with more than two decimals instead of rounding it', async () => {
      const trip = await create.execute(ANA, TRIP);

      await expect(update.execute(ANA, trip.goal.id, { targetAmount: '1500.005' })).rejects.toThrow(
        InvalidAmountError,
      );
    });

    it('archives keeping the first date, and restores', async () => {
      const trip = await create.execute(ANA, TRIP);

      const archived = await update.execute(ANA, trip.goal.id, { archived: true });
      clock = FixedClock.at(new Date('2026-10-20T17:00:00.000Z'));
      update = new UpdateGoal(goals, contributions, transactions, clock);
      const again = await update.execute(ANA, trip.goal.id, { archived: true });
      const restored = await update.execute(ANA, trip.goal.id, { archived: false });

      expect(archived.goal.archivedAt).toEqual(NOW);
      expect(again.goal.archivedAt).toEqual(NOW);
      expect(restored.goal.archivedAt).toBeNull();
    });

    it('corrects an archived goal too', async () => {
      const trip = await create.execute(ANA, TRIP);
      await update.execute(ANA, trip.goal.id, { archived: true });

      await expect(update.execute(ANA, trip.goal.id, { name: 'Viaje' })).resolves.toMatchObject({
        goal: { name: 'Viaje' },
      });
    });

    it('refuses a name another goal of the account has', async () => {
      await create.execute(ANA, TRIP);
      const laptop = await create.execute(ANA, { ...TRIP, name: 'Laptop' });

      await expect(update.execute(ANA, laptop.goal.id, { name: 'viaje a cusco' })).rejects.toThrow(
        GoalNameTakenError,
      );
    });

    it('does not find the goal of another account', async () => {
      const trip = await create.execute(ANA, TRIP);

      await expect(update.execute(BRUNO, trip.goal.id, { name: 'Mío' })).rejects.toThrow(
        GoalNotFoundError,
      );
    });
  });
});
