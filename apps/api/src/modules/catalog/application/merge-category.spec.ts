import {
  ArchivedParentCategoryError,
  CategoryMergeTypeMismatchError,
  FixedClock,
  type TransactionType,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { CategoryNotFoundError } from '../domain/errors.js';
import { CATEGORY_MERGED } from '../domain/events.js';
import { FakeCategoryRepository } from '../ports/category-repository.fake.js';
import { CreateCategory, UpdateCategory } from './categories.js';
import { MergeCategory } from './merge-category.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const NOW = '2026-09-28T15:00:00.000Z';

describe('merging categories', () => {
  let categories: FakeCategoryRepository;
  let events: RecordingEventPublisher;
  let create: CreateCategory;
  let update: UpdateCategory;
  let merge: MergeCategory;

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    events = new RecordingEventPublisher();
    create = new CreateCategory(categories);
    update = new UpdateCategory(categories, FixedClock.at(NOW));
    merge = new MergeCategory(categories, events, FixedClock.at(NOW));
  });

  function top(name: string, userId = ANA, type: TransactionType = 'VARIABLE_EXPENSE') {
    return create.execute({ userId, name, type });
  }

  function child(name: string, parentId: string, userId = ANA) {
    return create.execute({ userId, name, parentId });
  }

  function stored(id: string) {
    return categories.find(ANA, id);
  }

  it('archives the origin and answers the destination', async () => {
    const food = await top('Comida');
    const soda = await child('Gaseosa', food.id);
    const drinks = await child('Bebidas', food.id);

    const merged = await merge.execute({ userId: ANA, id: soda.id, intoId: drinks.id });

    expect(merged).toMatchObject({ id: drinks.id, archivedAt: null });
    await expect(stored(soda.id)).resolves.toMatchObject({ archivedAt: new Date(NOW) });
  });

  // `transactions` escucha esto para mover sus filas (ADR-0005).
  it('announces the merge once, with who, from and into', async () => {
    const food = await top('Comida');
    const soda = await child('Gaseosa', food.id);

    await merge.execute({ userId: ANA, id: soda.id, intoId: food.id });

    expect(events.published).toEqual([
      { name: CATEGORY_MERGED, payload: { userId: ANA, fromId: soda.id, intoId: food.id } },
    ]);
  });

  it('moves the children along, and merges those with a sibling of the same name', async () => {
    const shopping = await top('Compras');
    const clothes = await top('Ropa');
    const poncho = await child('Poncho', shopping.id);
    const oldShirts = await child('Camisas', shopping.id);
    const shirts = await child('camisas', clothes.id);

    await merge.execute({ userId: ANA, id: shopping.id, intoId: clothes.id });

    await expect(stored(poncho.id)).resolves.toMatchObject({
      parentId: clothes.id,
      archivedAt: null,
    });
    await expect(stored(oldShirts.id)).resolves.toMatchObject({ archivedAt: new Date(NOW) });
    expect(events.published.map((event) => event.payload)).toEqual([
      { userId: ANA, fromId: shopping.id, intoId: clothes.id },
      { userId: ANA, fromId: oldShirts.id, intoId: shirts.id },
    ]);
  });

  // Así se recupera lo que un oyente no alcanzó a mover.
  it('merges an already archived origin again, keeping its original date', async () => {
    const food = await top('Comida');
    const soda = await child('Gaseosa', food.id);
    await update.execute({ userId: ANA, id: soda.id, changes: { archived: true } });
    const later = new MergeCategory(categories, events, FixedClock.at('2026-10-01T00:00:00.000Z'));

    await later.execute({ userId: ANA, id: soda.id, intoId: food.id });

    await expect(stored(soda.id)).resolves.toMatchObject({ archivedAt: new Date(NOW) });
    expect(events.published).toHaveLength(1);
  });

  it('applies the rules of the domain, changing nothing when one breaks', async () => {
    const food = await top('Comida');
    const rent = await top('Alquiler', ANA, 'FIXED_EXPENSE');
    const soda = await child('Gaseosa', food.id);

    await expect(merge.execute({ userId: ANA, id: soda.id, intoId: rent.id })).rejects.toThrow(
      CategoryMergeTypeMismatchError,
    );
    await expect(stored(soda.id)).resolves.toMatchObject({ archivedAt: null });
    expect(events.published).toEqual([]);
  });

  it('rejects an archived destination', async () => {
    const food = await top('Comida');
    const soda = await child('Gaseosa', food.id);
    const drinks = await child('Bebidas', food.id);
    await update.execute({ userId: ANA, id: drinks.id, changes: { archived: true } });

    await expect(merge.execute({ userId: ANA, id: soda.id, intoId: drinks.id })).rejects.toThrow(
      ArchivedParentCategoryError,
    );
  });

  it.each(['origin', 'destination'])('does not find an %s of another account', async (side) => {
    const mine = await top('Comida');
    const hers = await top('Comida', BRUNO);
    const [id, intoId] = side === 'origin' ? [hers.id, mine.id] : [mine.id, hers.id];

    await expect(merge.execute({ userId: ANA, id, intoId })).rejects.toThrow(CategoryNotFoundError);
    expect(events.published).toEqual([]);
  });
});
