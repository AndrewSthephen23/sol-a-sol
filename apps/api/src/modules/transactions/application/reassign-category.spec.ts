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

  describe('with a tag, when a subcategory became one', () => {
    function read(transactions: FakeTransactionRepository, id: string) {
      return transactions.find(ANA, id);
    }

    it('tags every moved transaction, reusing an existing tag', async () => {
      const transactions = new FakeTransactionRepository();
      const plain = await transactions.create(lunch(ANA, 'breakfast'));
      const tagged = await transactions.create({
        ...lunch(ANA, 'breakfast'),
        tags: [{ name: 'desayuno', key: 'desayuno' }],
      });
      const other = await transactions.create(lunch(ANA, 'food'));

      await new ReassignCategory(transactions).execute({
        userId: ANA,
        fromId: 'breakfast',
        intoId: 'food',
        tag: 'Desayuno',
      });

      await expect(read(transactions, plain.id)).resolves.toMatchObject({
        categoryId: 'food',
        tags: ['desayuno'],
      });
      await expect(read(transactions, tagged.id)).resolves.toMatchObject({ tags: ['desayuno'] });
      await expect(read(transactions, other.id)).resolves.toMatchObject({ tags: [] });
      expect(transactions.tags).toHaveLength(1);
    });

    // El tope no se rompe: la transacción pasa a la madre, pero sin la etiqueta nueva.
    it('does not tag a transaction that already has ten tags', async () => {
      const transactions = new FakeTransactionRepository();
      const full = await transactions.create({
        ...lunch(ANA, 'breakfast'),
        tags: Array.from({ length: 10 }, (_, index) => ({
          name: `t${String(index)}`,
          key: `t${String(index)}`,
        })),
      });

      await new ReassignCategory(transactions).execute({
        userId: ANA,
        fromId: 'breakfast',
        intoId: 'food',
        tag: 'Desayuno',
      });

      const read = await transactions.find(ANA, full.id);
      expect(read?.categoryId).toBe('food');
      expect(read?.tags).toHaveLength(10);
      expect(read?.tags).not.toContain('Desayuno');
    });
  });
});
