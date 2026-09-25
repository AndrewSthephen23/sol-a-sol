import type { Currency, TransactionType } from '@sol-a-sol/domain';

import type { CatalogReader } from './catalog-reader.js';

interface Owned<T> {
  userId: string;
  value: T;
}

/** Catálogo en memoria: cada categoría y método pertenece a una cuenta, como en la base. */
export class FakeCatalogReader implements CatalogReader {
  private readonly categories = new Map<
    string,
    Owned<{ type: TransactionType; archived: boolean }> & { parentId: string | null }
  >();
  private readonly methods = new Map<
    string,
    Owned<{ currency: Currency | null; archived: boolean }>
  >();

  withCategory(
    userId: string,
    id: string,
    category: { type: TransactionType; archived?: boolean; parentId?: string },
  ): this {
    this.categories.set(id, {
      userId,
      parentId: category.parentId ?? null,
      value: { type: category.type, archived: category.archived ?? false },
    });

    return this;
  }

  withPaymentMethod(
    userId: string,
    id: string,
    value: { currency: Currency | null; archived?: boolean },
  ): this {
    this.methods.set(id, { userId, value: { archived: false, ...value } });

    return this;
  }

  category(
    userId: string,
    id: string,
  ): Promise<{ type: TransactionType; archived: boolean } | null> {
    return Promise.resolve(ownedBy(this.categories.get(id), userId));
  }

  categoryFamily(userId: string, id: string): Promise<string[] | null> {
    if (ownedBy(this.categories.get(id), userId) === null) return Promise.resolve(null);
    const children = [...this.categories.entries()]
      .filter(([, entry]) => entry.parentId === id)
      .map(([childId]) => childId);

    return Promise.resolve([id, ...children]);
  }

  paymentMethod(
    userId: string,
    id: string,
  ): Promise<{ currency: Currency | null; archived: boolean } | null> {
    return Promise.resolve(ownedBy(this.methods.get(id), userId));
  }
}

function ownedBy<T>(entry: Owned<T> | undefined, userId: string): T | null {
  return entry?.userId === userId ? entry.value : null;
}
