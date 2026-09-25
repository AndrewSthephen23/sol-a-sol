import { beforeEach, describe, expect, it } from 'vitest';

import { FakeCategoryRepository } from '../ports/category-repository.fake.js';
import { FakePaymentMethodRepository } from '../ports/payment-method-repository.fake.js';
import { CatalogLookup } from './catalog-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const ARCHIVED_AT = new Date('2026-09-24T15:00:00.000Z');

describe('catalog lookup', () => {
  let categories: FakeCategoryRepository;
  let methods: FakePaymentMethodRepository;
  let lookup: CatalogLookup;

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    methods = new FakePaymentMethodRepository();
    lookup = new CatalogLookup(categories, methods);
  });

  async function food(): Promise<string> {
    const category = await categories.create({
      userId: ANA,
      type: 'VARIABLE_EXPENSE',
      name: 'Comida',
      parentId: null,
      color: '#1E88E5',
      icon: 'utensils',
    });

    return category.id;
  }

  async function payroll(): Promise<string> {
    const method = await methods.create({
      userId: ANA,
      kind: 'ACCOUNT',
      alias: 'Sueldo BCP',
      institution: 'BCP',
      last4: null,
      currency: 'PEN',
    });

    return method.id;
  }

  describe('a category', () => {
    it('tells its type and that it is active', async () => {
      await expect(lookup.category(ANA, await food())).resolves.toEqual({
        type: 'VARIABLE_EXPENSE',
        archived: false,
      });
    });

    it('tells that it is archived', async () => {
      const id = await food();
      await categories.update(ANA, id, {}, { ids: [id], archivedAt: ARCHIVED_AT });

      await expect(lookup.category(ANA, id)).resolves.toMatchObject({ archived: true });
    });

    it('is not found in another account', async () => {
      await expect(lookup.category(BRUNO, await food())).resolves.toBeNull();
    });
  });

  describe('a payment method', () => {
    it('tells its currency and that it is active', async () => {
      await expect(lookup.paymentMethod(ANA, await payroll())).resolves.toEqual({
        currency: 'PEN',
        archived: false,
      });
    });

    it('tells that it is archived', async () => {
      const id = await payroll();
      await methods.update(ANA, id, { archivedAt: ARCHIVED_AT });

      await expect(lookup.paymentMethod(ANA, id)).resolves.toMatchObject({ archived: true });
    });

    it('is not found in another account', async () => {
      await expect(lookup.paymentMethod(BRUNO, await payroll())).resolves.toBeNull();
    });
  });
});
