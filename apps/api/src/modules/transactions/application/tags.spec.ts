import { FixedClock, InvalidTagNameError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { TagNotFoundError } from '../domain/errors.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTagRepository } from '../ports/tag-repository.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { DeleteTag, ListTags, RenameTag } from './tags.js';
import { type CreateTransactionInput, CreateTransaction, GetTransaction } from './transactions.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const FOOD = 'category-food';
const BRUNO_FOOD = 'category-bruno-food';

const LUNCH: CreateTransactionInput = {
  userId: ANA,
  date: '2026-09-24',
  type: 'VARIABLE_EXPENSE',
  categoryId: FOOD,
  amount: '25.90',
  currency: 'PEN',
  description: 'Almuerzo',
  source: 'MANUAL',
};

describe('tags', () => {
  let transactions: FakeTransactionRepository;
  let tags: FakeTagRepository;
  let create: CreateTransaction;
  let get: GetTransaction;
  let list: ListTags;
  let rename: RenameTag;
  let remove: DeleteTag;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    tags = new FakeTagRepository(transactions);
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(BRUNO, BRUNO_FOOD, { type: 'VARIABLE_EXPENSE' });
    create = new CreateTransaction(
      transactions,
      catalog,
      new RecordingEventPublisher(),
      FixedClock.at('2026-09-25T02:30:00.000Z'),
    );
    get = new GetTransaction(transactions);
    list = new ListTags(tags);
    rename = new RenameTag(tags);
    remove = new DeleteTag(tags);
  });

  async function tagged(names: string[], userId = ANA): Promise<string> {
    const categoryId = userId === ANA ? FOOD : BRUNO_FOOD;

    return (await create.execute({ ...LUNCH, userId, categoryId, tags: names })).id;
  }

  async function idOf(name: string, userId = ANA): Promise<string> {
    const found = (await list.execute({ userId })).find((tag) => tag.name === name);
    if (found === undefined) throw new Error(`No tag ${name}`);

    return found.id;
  }

  describe('listing them', () => {
    it('gives the tags of the account by name, with how many transactions use each', async () => {
      await tagged(['oficina', 'almuerzo']);
      await tagged(['almuerzo']);
      await tagged(['cena'], BRUNO);

      await expect(list.execute({ userId: ANA })).resolves.toEqual([
        { id: expect.any(String) as string, name: 'almuerzo', transactionCount: 2 },
        { id: expect.any(String) as string, name: 'oficina', transactionCount: 1 },
      ]);
    });

    it('does not count deleted transactions', async () => {
      await tagged(['almuerzo']);
      for (const row of transactions.rows) row.deletedAt = new Date('2026-09-25T00:00:00.000Z');

      await expect(list.execute({ userId: ANA })).resolves.toMatchObject([
        { name: 'almuerzo', transactionCount: 0 },
      ]);
    });
  });

  describe('renaming one', () => {
    it('changes its name everywhere it is used', async () => {
      const id = await tagged(['comida-rapida']);

      const renamed = await rename.execute({
        userId: ANA,
        id: await idOf('comida-rapida'),
        name: 'Delivery',
      });

      expect(renamed).toMatchObject({ name: 'Delivery', transactionCount: 1 });
      await expect(get.execute({ userId: ANA, id })).resolves.toMatchObject({ tags: ['Delivery'] });
    });

    it('changes only how it is written', async () => {
      await tagged(['almuerzo']);

      await expect(
        rename.execute({ userId: ANA, id: await idOf('almuerzo'), name: 'Almuerzo' }),
      ).resolves.toMatchObject({ name: 'Almuerzo' });
      expect(transactions.tags).toHaveLength(1);
    });

    // Decidido con el autor el 2026-09-28: el nombre de otra etiqueta las fusiona.
    it('merges it into another tag with that name, which takes the new spelling', async () => {
      const fast = await tagged(['comida-rapida']);
      const delivery = await tagged(['delivery']);

      const merged = await rename.execute({
        userId: ANA,
        id: await idOf('comida-rapida'),
        name: 'Delivery',
      });

      expect(merged).toMatchObject({ name: 'Delivery', transactionCount: 2 });
      await expect(get.execute({ userId: ANA, id: fast })).resolves.toMatchObject({
        tags: ['Delivery'],
      });
      await expect(get.execute({ userId: ANA, id: delivery })).resolves.toMatchObject({
        tags: ['Delivery'],
      });
      await expect(list.execute({ userId: ANA })).resolves.toHaveLength(1);
    });

    it('does not repeat a tag on a transaction that had both', async () => {
      const both = await tagged(['comida-rapida', 'delivery', 'cena']);

      await rename.execute({ userId: ANA, id: await idOf('comida-rapida'), name: 'delivery' });

      await expect(get.execute({ userId: ANA, id: both })).resolves.toMatchObject({
        tags: ['cena', 'delivery'],
      });
    });

    it('rejects a blank name or one with |', async () => {
      await tagged(['almuerzo']);
      const id = await idOf('almuerzo');

      await expect(rename.execute({ userId: ANA, id, name: ' ' })).rejects.toThrow(
        InvalidTagNameError,
      );
      await expect(rename.execute({ userId: ANA, id, name: 'a|b' })).rejects.toThrow(
        InvalidTagNameError,
      );
    });

    it('does not find the tag of another account, nor merge into one', async () => {
      await tagged(['almuerzo']);
      await tagged(['delivery'], BRUNO);
      const hers = await idOf('delivery', BRUNO);

      await expect(rename.execute({ userId: ANA, id: hers, name: 'x' })).rejects.toThrow(
        TagNotFoundError,
      );
      // "delivery" existe solo en la cuenta de Bruno: para Ana es un nombre libre.
      await expect(
        rename.execute({ userId: ANA, id: await idOf('almuerzo'), name: 'Delivery' }),
      ).resolves.toMatchObject({ name: 'Delivery', transactionCount: 1 });
      await expect(list.execute({ userId: BRUNO })).resolves.toMatchObject([
        { name: 'delivery', transactionCount: 1 },
      ]);
    });
  });

  describe('deleting one', () => {
    it('takes it out of every transaction, which stay as they were', async () => {
      const id = await tagged(['almuerzo', 'oficina']);

      await remove.execute({ userId: ANA, id: await idOf('almuerzo') });

      await expect(get.execute({ userId: ANA, id })).resolves.toMatchObject({
        tags: ['oficina'],
        description: 'Almuerzo',
      });
      await expect(list.execute({ userId: ANA })).resolves.toMatchObject([{ name: 'oficina' }]);
    });

    it('does not delete twice nor what belongs to another account', async () => {
      await tagged(['almuerzo'], BRUNO);
      const hers = await idOf('almuerzo', BRUNO);

      await expect(remove.execute({ userId: ANA, id: hers })).rejects.toThrow(TagNotFoundError);
      await remove.execute({ userId: BRUNO, id: hers });
      await expect(remove.execute({ userId: BRUNO, id: hers })).rejects.toThrow(TagNotFoundError);
    });
  });
});
