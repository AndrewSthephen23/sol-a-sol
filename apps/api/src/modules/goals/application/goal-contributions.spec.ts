import {
  FixedClock,
  FutureGoalContributionError,
  GoalContributionAmountNotPositiveError,
  GoalCurrencyMismatchError,
  GoalTransactionNotASavingError,
  GoalWithdrawalExceedsSavedError,
  InvalidAmountError,
  LocalDate,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  GoalArchivedError,
  GoalContributionNotFoundError,
  GoalNotFoundError,
  GoalTransactionAlreadyLinkedError,
  GoalTransactionNotFoundError,
} from '../domain/errors.js';
import { FakeGoalContributionRepository } from '../ports/goal-contribution-repository.fake.js';
import { FakeGoalRepository } from '../ports/goal-repository.fake.js';
import type { GoalTransaction } from '../ports/transactions-reader.js';
import { FakeGoalTransactionsReader } from '../ports/transactions-reader.fake.js';
import {
  AddGoalContribution,
  DeleteGoalContribution,
  type GoalContributionInput,
  ListGoalContributions,
} from './goal-contributions.js';
import type { GoalContributionView } from './goal-views.js';
import { ListGoals, UpdateGoal } from './goals.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 2026-10-03 en Lima.
const NOW = new Date('2026-10-03T17:00:00.000Z');
const date = (text: string) => LocalDate.parse(text);

function saving(id: string, extra: Partial<GoalTransaction> = {}): GoalTransaction {
  return {
    id,
    date: date('2026-09-10'),
    type: 'SAVING',
    amount: Money.of('500.00', 'PEN'),
    description: 'Ahorro de setiembre',
    ...extra,
  };
}

function manual(
  kind: 'CONTRIBUTION' | 'WITHDRAWAL',
  amount: string,
  on = '2026-09-15',
): GoalContributionInput {
  return { source: 'MANUAL', kind, amount, date: date(on) };
}

/** Lo que importa de un aporte, como texto. */
function plain(view: GoalContributionView) {
  return {
    source: view.contribution.source,
    kind: view.kind,
    state: view.state,
    amount: view.amount?.toFixed() ?? null,
    date: view.date?.toString() ?? null,
  };
}

describe('goal contribution use cases', () => {
  let goals: FakeGoalRepository;
  let contributions: FakeGoalContributionRepository;
  let transactions: FakeGoalTransactionsReader;
  let add: AddGoalContribution;
  let remove: DeleteGoalContribution;
  let listContributions: ListGoalContributions;
  let listGoals: ListGoals;
  let trip: string;

  beforeEach(async () => {
    const clock = FixedClock.at(NOW);
    goals = new FakeGoalRepository();
    contributions = new FakeGoalContributionRepository();
    transactions = new FakeGoalTransactionsReader()
      .with(ANA, saving('saving-ana'))
      .with(
        ANA,
        saving('investment-ana', { type: 'INVESTMENT', amount: Money.of('250.00', 'PEN') }),
      )
      .with(ANA, saving('expense-ana', { type: 'VARIABLE_EXPENSE' }))
      .with(ANA, saving('dollars-ana', { amount: Money.of('100.00', 'USD') }))
      .with(ANA, saving('deleted-ana'), true)
      .with(BRUNO, saving('saving-bruno'));
    add = new AddGoalContribution(goals, contributions, transactions, clock);
    remove = new DeleteGoalContribution(goals, contributions, transactions, clock);
    listContributions = new ListGoalContributions(goals, contributions, transactions, clock);
    listGoals = new ListGoals(goals, contributions, transactions, clock);
    ({ id: trip } = await goals.create(ANA, {
      name: 'Viaje a Cusco',
      target: Money.of('1200.00', 'PEN'),
      startDate: date('2026-01-01'),
      endDate: date('2026-12-31'),
    }));
  });

  async function saved(): Promise<string | undefined> {
    const [view] = await listGoals.execute(ANA, { includeArchived: true });

    return view?.progress.saved.toFixed();
  }

  describe('manual contributions and withdrawals', () => {
    it('adds a contribution in the goal currency', async () => {
      const view = await add.execute(ANA, trip, manual('CONTRIBUTION', '300.00'));

      expect(plain(view)).toEqual({
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        state: 'ACTIVE',
        amount: '300.00',
        date: '2026-09-15',
      });
      expect(view.amount?.currency).toBe('PEN');
      await expect(saved()).resolves.toBe('300.00');
    });

    it('takes a withdrawal off what was saved', async () => {
      await add.execute(ANA, trip, manual('CONTRIBUTION', '300.00'));

      await add.execute(ANA, trip, manual('WITHDRAWAL', '300.00', '2026-10-03'));

      await expect(saved()).resolves.toBe('0.00');
    });

    it('refuses a withdrawal bigger than what was saved', async () => {
      await add.execute(ANA, trip, manual('CONTRIBUTION', '300.00'));

      await expect(add.execute(ANA, trip, manual('WITHDRAWAL', '300.01'))).rejects.toThrow(
        GoalWithdrawalExceedsSavedError,
      );
      await expect(saved()).resolves.toBe('300.00');
    });

    it('counts a linked contribution when checking a withdrawal', async () => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });

      await expect(add.execute(ANA, trip, manual('WITHDRAWAL', '500.00'))).resolves.toMatchObject({
        kind: 'WITHDRAWAL',
      });
    });

    it('accepts one dated before the goal starts', async () => {
      await add.execute(ANA, trip, manual('CONTRIBUTION', '100.00', '2025-11-30'));

      await expect(saved()).resolves.toBe('100.00');
    });

    it.each([
      ['a zero amount', ['CONTRIBUTION', '0.00'], GoalContributionAmountNotPositiveError],
      ['a negative amount', ['WITHDRAWAL', '-5.00'], GoalContributionAmountNotPositiveError],
      ['a date after today', ['CONTRIBUTION', '5.00', '2026-10-04'], FutureGoalContributionError],
      ['an amount with three decimals', ['CONTRIBUTION', '5.001'], InvalidAmountError],
    ] as const)('refuses %s', async (_label, [kind, amount, on], error) => {
      await expect(add.execute(ANA, trip, manual(kind, amount, on))).rejects.toThrow(error);
      await expect(listContributions.execute(ANA, trip)).resolves.toEqual([]);
    });
  });

  describe('linked contributions', () => {
    it.each([
      ['a saving', 'saving-ana', '500.00'],
      ['an investment', 'investment-ana', '250.00'],
    ])('take the whole of %s, with its date', async (_label, transactionId, amount) => {
      const view = await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId });

      expect(plain(view)).toEqual({
        source: 'TRANSACTION',
        kind: 'CONTRIBUTION',
        state: 'ACTIVE',
        amount,
        date: '2026-09-10',
      });
      expect(view.transaction?.description).toBe('Ahorro de setiembre');
    });

    it('follow the transaction when it is corrected', async () => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });

      transactions.change('saving-ana', { amount: Money.of('650.00', 'PEN') });

      await expect(saved()).resolves.toBe('650.00');
    });

    it.each([
      ['deleted', { deleted: true }, 'TRANSACTION_DELETED', null],
      [
        'turned into an expense',
        { type: 'FIXED_EXPENSE' as const },
        'TRANSACTION_NOT_A_SAVING',
        '500.00',
      ],
      ['moved to dollars', { currency: 'USD' as const }, 'CURRENCY_MISMATCH', '500.00'],
    ])('stop counting when the transaction is %s', async (_label, changes, state, amount) => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });

      const { currency, ...rest } = changes as typeof changes & { currency?: 'USD' };
      transactions.change('saving-ana', {
        ...rest,
        ...(currency === undefined ? {} : { amount: Money.of('500.00', currency) }),
      });
      const [view] = await listContributions.execute(ANA, trip);

      expect(view?.state).toBe(state);
      expect(view?.amount?.toFixed() ?? null).toBe(amount);
      await expect(saved()).resolves.toBe('0.00');
    });

    it('count again when the transaction is restored', async () => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });
      transactions.change('saving-ana', { deleted: true });

      transactions.change('saving-ana', { deleted: false });

      await expect(saved()).resolves.toBe('500.00');
    });

    it('refuses a transaction that is not a saving or an investment', async () => {
      await expect(
        add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'expense-ana' }),
      ).rejects.toThrow(GoalTransactionNotASavingError);
    });

    it('refuses a transaction in another currency', async () => {
      await expect(
        add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'dollars-ana' }),
      ).rejects.toThrow(GoalCurrencyMismatchError);
    });

    it.each([
      ['deleted', 'deleted-ana'],
      ['of another account', 'saving-bruno'],
      ['that does not exist', 'missing'],
    ])('do not find a transaction %s', async (_label, transactionId) => {
      await expect(
        add.execute(ANA, trip, { source: 'TRANSACTION', transactionId }),
      ).rejects.toThrow(GoalTransactionNotFoundError);
    });

    it('link a transaction to a single goal', async () => {
      const { id: laptop } = await goals.create(ANA, {
        name: 'Laptop',
        target: Money.of('3000.00', 'PEN'),
        startDate: date('2026-01-01'),
        endDate: date('2026-12-31'),
      });
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });

      await expect(
        add.execute(ANA, laptop, { source: 'TRANSACTION', transactionId: 'saving-ana' }),
      ).rejects.toThrow(GoalTransactionAlreadyLinkedError);
    });
  });

  describe('the goal', () => {
    it('must be of the account', async () => {
      await expect(add.execute(BRUNO, trip, manual('CONTRIBUTION', '5.00'))).rejects.toThrow(
        GoalNotFoundError,
      );
      await expect(listContributions.execute(BRUNO, trip)).rejects.toThrow(GoalNotFoundError);
    });

    it('must not be archived to receive contributions, but can still undo them', async () => {
      const added = await add.execute(ANA, trip, manual('CONTRIBUTION', '5.00'));
      await new UpdateGoal(goals, contributions, transactions, FixedClock.at(NOW)).execute(
        ANA,
        trip,
        { archived: true },
      );

      await expect(add.execute(ANA, trip, manual('CONTRIBUTION', '5.00'))).rejects.toThrow(
        GoalArchivedError,
      );
      await expect(remove.execute(ANA, trip, added.contribution.id)).resolves.toBeUndefined();
    });
  });

  describe('ListGoalContributions', () => {
    it('lists the newest first, the last registered first within a day, deleted links last', async () => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });
      await add.execute(ANA, trip, manual('CONTRIBUTION', '100.00', '2026-09-20'));
      await add.execute(ANA, trip, manual('CONTRIBUTION', '200.00', '2026-09-20'));
      await add.execute(ANA, trip, manual('CONTRIBUTION', '50.00', '2026-08-01'));
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'investment-ana' });
      transactions.change('investment-ana', { deleted: true });

      const views = await listContributions.execute(ANA, trip);

      expect(views.map((view) => view.amount?.toFixed() ?? null)).toEqual([
        '200.00',
        '100.00',
        '500.00',
        '50.00',
        null,
      ]);
    });
  });

  describe('DeleteGoalContribution', () => {
    it('undoes a contribution', async () => {
      const added = await add.execute(ANA, trip, manual('CONTRIBUTION', '300.00'));

      await remove.execute(ANA, trip, added.contribution.id);

      await expect(saved()).resolves.toBe('0.00');
    });

    it('refuses undoing a contribution a withdrawal already took out', async () => {
      const first = await add.execute(ANA, trip, manual('CONTRIBUTION', '300.00'));
      await add.execute(ANA, trip, manual('CONTRIBUTION', '100.00'));
      await add.execute(ANA, trip, manual('WITHDRAWAL', '200.00'));

      await expect(remove.execute(ANA, trip, first.contribution.id)).rejects.toThrow(
        GoalWithdrawalExceedsSavedError,
      );
    });

    it('always lets a withdrawal be undone, even with the goal below zero', async () => {
      await add.execute(ANA, trip, { source: 'TRANSACTION', transactionId: 'saving-ana' });
      const withdrawal = await add.execute(ANA, trip, manual('WITHDRAWAL', '400.00'));
      transactions.change('saving-ana', { deleted: true });

      await remove.execute(ANA, trip, withdrawal.contribution.id);

      await expect(saved()).resolves.toBe('0.00');
    });

    it('lets a link that no longer counts be undone', async () => {
      const linked = await add.execute(ANA, trip, {
        source: 'TRANSACTION',
        transactionId: 'saving-ana',
      });
      await add.execute(ANA, trip, manual('WITHDRAWAL', '400.00'));
      transactions.change('saving-ana', { type: 'INCOME' });

      await expect(remove.execute(ANA, trip, linked.contribution.id)).resolves.toBeUndefined();
    });

    it('does not find the contribution of another goal, even of the same account', async () => {
      const { id: laptop } = await goals.create(ANA, {
        name: 'Laptop',
        target: Money.of('3000.00', 'PEN'),
        startDate: date('2026-01-01'),
        endDate: date('2026-12-31'),
      });
      const added = await add.execute(ANA, laptop, manual('CONTRIBUTION', '5.00'));

      await expect(remove.execute(ANA, trip, added.contribution.id)).rejects.toThrow(
        GoalContributionNotFoundError,
      );
    });

    it('does not find the goal of another account', async () => {
      const added = await add.execute(ANA, trip, manual('CONTRIBUTION', '5.00'));

      await expect(remove.execute(BRUNO, trip, added.contribution.id)).rejects.toThrow(
        GoalNotFoundError,
      );
    });
  });
});
