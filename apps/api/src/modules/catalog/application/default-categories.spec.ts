import { beforeEach, describe, expect, it } from 'vitest';

import type { ListAccountIds } from '../../identity/index.js';
import { FakeCategoryRepository } from '../ports/category-repository.fake.js';
import { SeedAccountsWithoutCategories, SeedDefaultCategories } from './default-categories.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

describe('default categories', () => {
  let categories: FakeCategoryRepository;
  let seed: SeedDefaultCategories;

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    seed = new SeedDefaultCategories(categories);
  });

  function namesOf(userId: string): string[] {
    return categories.rows.filter((row) => row.userId === userId).map((row) => row.name);
  }

  describe('seeding an account', () => {
    it('creates the whole list, with subcategories under their parents', async () => {
      await expect(seed.execute(ANA)).resolves.toBe(true);

      expect(namesOf(ANA)).toHaveLength(34);
      const food = categories.rows.find((row) => row.name === 'Comida');
      const delivery = categories.rows.find((row) => row.name === 'Delivery');
      expect(delivery).toMatchObject({
        parentId: food?.id,
        type: 'VARIABLE_EXPENSE',
        color: food?.color,
        icon: 'bike',
      });
    });

    // Idempotente: correrla dos veces no duplica nada.
    it('does nothing the second time', async () => {
      await seed.execute(ANA);

      await expect(seed.execute(ANA)).resolves.toBe(false);
      expect(namesOf(ANA)).toHaveLength(34);
    });

    // Nunca toca a quien ya armó las suyas: ni completa ni mezcla.
    it('does nothing to an account that already has any category', async () => {
      await categories.create({
        userId: ANA,
        type: 'INCOME',
        name: 'Honorarios',
        parentId: null,
        color: '#2E7D32',
        icon: 'briefcase',
      });

      await expect(seed.execute(ANA)).resolves.toBe(false);
      expect(namesOf(ANA)).toEqual(['Honorarios']);
    });
  });

  describe('seeding every account without categories (pnpm db:seed)', () => {
    it('seeds only the accounts that have none, and says how many', async () => {
      await seed.execute(ANA);
      const accounts = { execute: () => Promise.resolve([ANA, BRUNO]) } as ListAccountIds;

      const summary = await new SeedAccountsWithoutCategories(accounts, seed).execute();

      expect(summary).toEqual({ seeded: 1, skipped: 1 });
      expect(namesOf(BRUNO)).toHaveLength(34);
      expect(namesOf(ANA)).toHaveLength(34);
    });
  });
});
