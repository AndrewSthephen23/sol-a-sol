import type { TransactionType } from '@sol-a-sol/domain';

import type { BudgetCatalogReader } from './catalog-reader.js';

interface FakeCategory {
  userId: string;
  type: TransactionType;
  archived: boolean;
  parentId: string | null;
}

/** Catálogo en memoria: cada categoría pertenece a una cuenta, como en la base. */
export class FakeBudgetCatalogReader implements BudgetCatalogReader {
  private readonly categories = new Map<string, FakeCategory>();

  withCategory(
    userId: string,
    id: string,
    category: { type: TransactionType; archived?: boolean; parentId?: string },
  ): this {
    this.categories.set(id, {
      userId,
      type: category.type,
      archived: category.archived ?? false,
      parentId: category.parentId ?? null,
    });

    return this;
  }

  category(
    userId: string,
    id: string,
  ): Promise<{ type: TransactionType; archived: boolean; parentId: string | null } | null> {
    const found = this.categories.get(id);
    if (found?.userId !== userId) return Promise.resolve(null);

    return Promise.resolve({
      type: found.type,
      archived: found.archived,
      parentId: found.parentId,
    });
  }
}
