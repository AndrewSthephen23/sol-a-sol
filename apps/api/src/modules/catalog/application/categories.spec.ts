import {
  ArchivedParentCategoryError,
  CategoryTooDeepError,
  CategoryTypeRequiredError,
  FixedClock,
  InvalidCategoryColorError,
  SubcategoryTypeMismatchError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { CategoryNameTakenError, CategoryNotFoundError } from '../domain/errors.js';
import { FakeCategoryRepository } from '../ports/category-repository.fake.js';
import {
  CreateCategory,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  ListCategories,
  UpdateCategory,
} from './categories.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const NOW = '2026-09-24T15:00:00.000Z';
const FOOD = {
  name: 'Comida',
  type: 'VARIABLE_EXPENSE',
  color: '#1E88E5',
  icon: 'utensils',
} as const;

describe('categories', () => {
  let categories: FakeCategoryRepository;
  let create: CreateCategory;
  let list: ListCategories;
  let update: UpdateCategory;

  function updateAt(instant: string): UpdateCategory {
    return new UpdateCategory(categories, FixedClock.at(instant));
  }

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    create = new CreateCategory(categories);
    list = new ListCategories(categories);
    update = updateAt(NOW);
  });

  describe('creating one', () => {
    it('creates a top-level category with what was sent', async () => {
      await expect(create.execute({ userId: ANA, ...FOOD })).resolves.toMatchObject({
        ...FOOD,
        parentId: null,
        archivedAt: null,
      });
    });

    it('gives a default color and icon to a top-level category without them', async () => {
      const saving = await create.execute({ userId: ANA, name: 'CTS', type: 'SAVING' });

      expect(saving).toMatchObject({ color: DEFAULT_CATEGORY_COLOR, icon: DEFAULT_CATEGORY_ICON });
    });

    it('lets a subcategory inherit the type, color and icon of its parent', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });

      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });

      expect(delivery).toMatchObject({
        type: 'VARIABLE_EXPENSE',
        parentId: food.id,
        color: '#1E88E5',
        icon: 'utensils',
      });
    });

    it('applies the rules of the domain', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });

      await expect(create.execute({ userId: ANA, name: 'Sin tipo' })).rejects.toThrow(
        CategoryTypeRequiredError,
      );
      await expect(
        create.execute({ userId: ANA, name: 'Pizza', parentId: delivery.id }),
      ).rejects.toThrow(CategoryTooDeepError);
      await expect(
        create.execute({ userId: ANA, name: 'Cine', type: 'FIXED_EXPENSE', parentId: food.id }),
      ).rejects.toThrow(SubcategoryTypeMismatchError);
      await expect(
        create.execute({ userId: ANA, ...FOOD, name: 'Otra', color: 'azul' }),
      ).rejects.toThrow(InvalidCategoryColorError);
      expect(categories.rows).toHaveLength(2);
    });

    it('rejects a name already taken by a sibling, ignoring case and accents', async () => {
      await create.execute({ userId: ANA, ...FOOD, name: 'Café' });

      await expect(create.execute({ userId: ANA, ...FOOD, name: 'CAFE' })).rejects.toThrow(
        CategoryNameTakenError,
      );
    });

    it("answers not found for another user's parent", async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });

      await expect(
        create.execute({ userId: BRUNO, name: 'Delivery', parentId: food.id }),
      ).rejects.toThrow(CategoryNotFoundError);
    });

    it('does not hang a new subcategory from an archived parent', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      await update.execute({ userId: ANA, id: food.id, changes: { archived: true } });

      await expect(
        create.execute({ userId: ANA, name: 'Delivery', parentId: food.id }),
      ).rejects.toThrow(ArchivedParentCategoryError);
    });
  });

  describe('listing', () => {
    it('nests the subcategories and orders by name, the Spanish way', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      await create.execute({ userId: ANA, name: 'Supermercado', parentId: food.id });
      await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });
      await create.execute({ userId: ANA, ...FOOD, name: 'Árbitros' });
      await create.execute({ userId: ANA, ...FOOD, name: 'Ropa' });

      const tree = await list.execute({ userId: ANA, includeArchived: false });

      expect(tree.map((node) => node.name)).toEqual(['Árbitros', 'Comida', 'Ropa']);
      expect(tree[1]?.children.map((child) => child.name)).toEqual(['Delivery', 'Supermercado']);
    });

    it('filters by type', async () => {
      await create.execute({ userId: ANA, ...FOOD });
      await create.execute({ userId: ANA, name: 'Sueldo', type: 'INCOME' });

      const income = await list.execute({ userId: ANA, type: 'INCOME', includeArchived: false });

      expect(income.map((node) => node.name)).toEqual(['Sueldo']);
    });

    it('leaves the archived ones out unless asked', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });
      await create.execute({ userId: ANA, name: 'Supermercado', parentId: food.id });
      await update.execute({ userId: ANA, id: delivery.id, changes: { archived: true } });

      const active = await list.execute({ userId: ANA, includeArchived: false });
      const all = await list.execute({ userId: ANA, includeArchived: true });

      expect(active[0]?.children.map((child) => child.name)).toEqual(['Supermercado']);
      expect(all[0]?.children.map((child) => child.name)).toEqual(['Delivery', 'Supermercado']);
    });

    it("shows only the user's own categories", async () => {
      await create.execute({ userId: ANA, ...FOOD });

      await expect(list.execute({ userId: BRUNO, includeArchived: true })).resolves.toEqual([]);
    });
  });

  describe('updating', () => {
    it('renames and changes the color and icon', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });

      const updated = await update.execute({
        userId: ANA,
        id: food.id,
        changes: { name: 'Alimentación', color: '#43A047', icon: 'apple' },
      });

      expect(updated).toMatchObject({ name: 'Alimentación', color: '#43A047', icon: 'apple' });
    });

    it('rejects an invalid color and a name taken by a sibling', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      await create.execute({ userId: ANA, ...FOOD, name: 'Ropa' });

      await expect(
        update.execute({ userId: ANA, id: food.id, changes: { color: 'verde' } }),
      ).rejects.toThrow(InvalidCategoryColorError);
      await expect(
        update.execute({ userId: ANA, id: food.id, changes: { name: 'ropa' } }),
      ).rejects.toThrow(CategoryNameTakenError);
    });

    it('archives a parent together with its active children, at the same instant', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });

      await update.execute({ userId: ANA, id: food.id, changes: { archived: true } });

      expect((await categories.find(ANA, food.id))?.archivedAt).toEqual(new Date(NOW));
      expect((await categories.find(ANA, delivery.id))?.archivedAt).toEqual(new Date(NOW));
    });

    it('restores only the children archived together with the parent', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });
      const market = await create.execute({ userId: ANA, name: 'Mercado', parentId: food.id });
      await updateAt('2026-09-01T15:00:00.000Z').execute({
        userId: ANA,
        id: market.id,
        changes: { archived: true },
      });
      await update.execute({ userId: ANA, id: food.id, changes: { archived: true } });

      await updateAt('2026-09-30T15:00:00.000Z').execute({
        userId: ANA,
        id: food.id,
        changes: { archived: false },
      });

      expect((await categories.find(ANA, food.id))?.archivedAt).toBeNull();
      expect((await categories.find(ANA, delivery.id))?.archivedAt).toBeNull();
      expect((await categories.find(ANA, market.id))?.archivedAt).toEqual(
        new Date('2026-09-01T15:00:00.000Z'),
      );
    });

    it('does not restore a subcategory while its parent is archived', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });
      await update.execute({ userId: ANA, id: food.id, changes: { archived: true } });

      await expect(
        update.execute({ userId: ANA, id: delivery.id, changes: { archived: false } }),
      ).rejects.toThrow(ArchivedParentCategoryError);
    });

    it('restores a subcategory whose parent is active', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      const delivery = await create.execute({ userId: ANA, name: 'Delivery', parentId: food.id });
      await update.execute({ userId: ANA, id: delivery.id, changes: { archived: true } });

      const restored = await update.execute({
        userId: ANA,
        id: delivery.id,
        changes: { archived: false },
      });

      expect(restored.archivedAt).toBeNull();
    });

    it('keeps the original date when archiving an archived category again', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      await update.execute({ userId: ANA, id: food.id, changes: { archived: true } });

      const again = await updateAt('2026-10-01T15:00:00.000Z').execute({
        userId: ANA,
        id: food.id,
        changes: { archived: true },
      });

      expect(again.archivedAt).toEqual(new Date(NOW));
    });

    it('changes nothing when restoring an active category', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });

      const same = await update.execute({ userId: ANA, id: food.id, changes: { archived: false } });

      expect(same.archivedAt).toBeNull();
    });

    it("answers not found for another user's category and leaves it untouched", async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });

      await expect(
        update.execute({ userId: BRUNO, id: food.id, changes: { archived: true } }),
      ).rejects.toThrow(CategoryNotFoundError);
      expect((await categories.find(ANA, food.id))?.archivedAt).toBeNull();
    });

    it('answers not found when the category vanishes before the write', async () => {
      const food = await create.execute({ userId: ANA, ...FOOD });
      categories.update = () => Promise.resolve(null);

      await expect(
        update.execute({ userId: ANA, id: food.id, changes: { name: 'Otra' } }),
      ).rejects.toThrow(CategoryNotFoundError);
    });
  });
});
