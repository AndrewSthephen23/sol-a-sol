import { LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { TransactionsLookup } from './transactions-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

describe('TransactionsLookup', () => {
  let transactions: FakeTransactionRepository;
  let lookup: TransactionsLookup;

  async function spend(userId: string, date: string, categoryId: string, amount: Money) {
    return transactions.create({
      userId,
      date: LocalDate.parse(date),
      type: 'VARIABLE_EXPENSE',
      categoryId,
      amount,
      description: 'Gasto',
      paymentMethodId: null,
      merchant: null,
      source: 'MANUAL',
      tags: [],
    });
  }

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    lookup = new TransactionsLookup(transactions);
  });

  it('gives the totals of a date range by category, type and currency', async () => {
    await spend(ANA, '2026-09-01', 'food', Money.of('10', 'PEN'));
    await spend(ANA, '2026-09-30', 'food', Money.of('5', 'USD'));

    const totals = await lookup.totalsByCategory(
      ANA,
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-09-30'),
    );

    expect(
      totals.map((total) => [
        total.categoryId,
        total.type,
        total.amount.currency,
        total.amount.toFixed(),
      ]),
    ).toEqual([
      ['food', 'VARIABLE_EXPENSE', 'PEN', '10.00'],
      ['food', 'VARIABLE_EXPENSE', 'USD', '5.00'],
    ]);
  });

  it('leaves out other dates, deleted transactions and other accounts', async () => {
    await spend(ANA, '2026-08-31', 'food', Money.of('1', 'PEN'));
    await spend(ANA, '2026-10-01', 'food', Money.of('1', 'PEN'));
    const deleted = await spend(ANA, '2026-09-15', 'food', Money.of('1', 'PEN'));
    await transactions.softDelete(ANA, deleted.id, new Date());
    await spend(BRUNO, '2026-09-15', 'food', Money.of('1', 'PEN'));

    await expect(
      lookup.totalsByCategory(ANA, LocalDate.parse('2026-09-01'), LocalDate.parse('2026-09-30')),
    ).resolves.toEqual([]);
  });
});
