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
    Owned<{ type: TransactionType; archived: boolean }>
  >();
  private readonly methods = new Map<
    string,
    Owned<{ currency: Currency | null; archived: boolean }>
  >();

  withCategory(
    userId: string,
    id: string,
    value: { type: TransactionType; archived?: boolean },
  ): this {
    this.categories.set(id, { userId, value: { archived: false, ...value } });

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
