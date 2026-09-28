import type { Currency, TransactionType } from '@sol-a-sol/domain';

import type { CatalogCategory, CatalogPaymentMethod, CatalogReader } from './catalog-reader.js';

interface FakeCategory extends CatalogCategory {
  userId: string;
}

interface FakePaymentMethod extends CatalogPaymentMethod {
  userId: string;
}

/**
 * Catálogo en memoria: cada categoría y método pertenece a una cuenta, como en la base. Sin nombre
 * o alias, se usa el id.
 */
export class FakeCatalogReader implements CatalogReader {
  private readonly categories = new Map<string, FakeCategory>();
  private readonly methods = new Map<string, FakePaymentMethod>();

  withCategory(
    userId: string,
    id: string,
    category: { type: TransactionType; archived?: boolean; parentId?: string; name?: string },
  ): this {
    this.categories.set(id, {
      id,
      userId,
      name: category.name ?? id,
      type: category.type,
      parentId: category.parentId ?? null,
      archived: category.archived ?? false,
    });

    return this;
  }

  withPaymentMethod(
    userId: string,
    id: string,
    method: { currency: Currency | null; archived?: boolean; alias?: string },
  ): this {
    this.methods.set(id, {
      id,
      userId,
      alias: method.alias ?? id,
      currency: method.currency,
      archived: method.archived ?? false,
    });

    return this;
  }

  category(
    userId: string,
    id: string,
  ): Promise<{ type: TransactionType; archived: boolean } | null> {
    const found = this.ownCategory(userId, id);

    return Promise.resolve(
      found === undefined ? null : { type: found.type, archived: found.archived },
    );
  }

  categoryFamily(userId: string, id: string): Promise<string[] | null> {
    if (this.ownCategory(userId, id) === undefined) return Promise.resolve(null);
    const children = [...this.categories.values()]
      .filter((category) => category.parentId === id)
      .map((category) => category.id);

    return Promise.resolve([id, ...children]);
  }

  paymentMethod(
    userId: string,
    id: string,
  ): Promise<{ currency: Currency | null; archived: boolean } | null> {
    const found = this.methods.get(id);

    return Promise.resolve(
      found?.userId === userId ? { currency: found.currency, archived: found.archived } : null,
    );
  }

  allCategories(userId: string): Promise<CatalogCategory[]> {
    return Promise.resolve(
      [...this.categories.values()]
        .filter((category) => category.userId === userId)
        .map(({ id, name, type, parentId, archived }) => ({ id, name, type, parentId, archived })),
    );
  }

  allPaymentMethods(userId: string): Promise<CatalogPaymentMethod[]> {
    return Promise.resolve(
      [...this.methods.values()]
        .filter((method) => method.userId === userId)
        .map(({ id, alias, currency, archived }) => ({ id, alias, currency, archived })),
    );
  }

  private ownCategory(userId: string, id: string): FakeCategory | undefined {
    const found = this.categories.get(id);

    return found?.userId === userId ? found : undefined;
  }
}
