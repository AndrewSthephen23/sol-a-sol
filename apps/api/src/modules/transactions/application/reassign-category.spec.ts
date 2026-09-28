import { LocalDate, Money } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { ReassignCategory } from './reassign-category.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

function lunch(userId: string, categoryId: string) {
  return {
    userId,
    date: LocalDate.of(2026, 9, 24),
    type: 'VARIABLE_EXPENSE' as const,
    categoryId,
    amount: Money.of('10.00', 'PEN'),
    description: 'Almuerzo',
    paymentMethodId: null,
    merchant: null,
    source: 'MANUAL' as const,
    tags: [],
  };
}

describe('reassigning a merged category', () => {
  it('moves every transaction of the origin, deleted ones included, and says how many', async () => {
    const transactions = new FakeTransactionRepository();
    const live = await transactions.create(lunch(ANA, 'soda'));
    const deleted = await transactions.create(lunch(ANA, 'soda'));
    await transactions.softDelete(ANA, deleted.id, new Date('2026-09-25T00:00:00.000Z'));
    const other = await transactions.create(lunch(ANA, 'food'));

    const moved = await new ReassignCategory(transactions).execute({
      userId: ANA,
      fromId: 'soda',
      intoId: 'drinks',
    });

    expect(moved).toBe(2);
    expect(transactions.rows.map((row) => [row.id, row.categoryId])).toEqual([
      [live.id, 'drinks'],
      [deleted.id, 'drinks'],
      [other.id, 'food'],
    ]);
  });

  it('never touches another account', async () => {
    const transactions = new FakeTransactionRepository();
    await transactions.create(lunch(BRUNO, 'soda'));

    await expect(
      new ReassignCategory(transactions).execute({ userId: ANA, fromId: 'soda', intoId: 'drinks' }),
    ).resolves.toBe(0);
    expect(transactions.rows[0]?.categoryId).toBe('soda');
  });
});
