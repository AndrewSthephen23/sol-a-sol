import type { Currency, PaymentMethodKind, TransactionType } from '@sol-a-sol/domain';

import type { CatalogReader } from './catalog-reader.js';
import type { FakeCatalogReader } from './catalog-reader.fake.js';
import type { CatalogWriter } from './catalog-writer.js';

/**
 * Escribe en el mismo catálogo en memoria que lee `FakeCatalogReader`, y anota lo que hizo para
 * que las pruebas lo miren.
 */
export class FakeCatalogWriter implements CatalogWriter {
  readonly created: string[] = [];
  readonly restored: string[] = [];
  private sequence = 0;

  constructor(private readonly catalog: FakeCatalogReader & CatalogReader) {}

  createCategory(
    userId: string,
    category: { type: TransactionType; name: string; parentId: string | null },
  ): Promise<string> {
    const id = this.nextId('category');
    this.catalog.withCategory(userId, id, {
      type: category.type,
      name: category.name,
      ...(category.parentId === null ? {} : { parentId: category.parentId }),
    });
    this.created.push(id);

    return Promise.resolve(id);
  }

  async restoreCategory(userId: string, id: string): Promise<void> {
    const found = (await this.catalog.allCategories(userId)).find((category) => category.id === id);
    if (found === undefined) throw new Error(`No category ${id}`);
    this.catalog.withCategory(userId, id, {
      type: found.type,
      name: found.name,
      ...(found.parentId === null ? {} : { parentId: found.parentId }),
    });
    this.restored.push(id);
  }

  createPaymentMethod(
    userId: string,
    method: {
      kind: PaymentMethodKind;
      alias: string;
      institution: string | null;
      last4: string | null;
      currency: Currency | null;
    },
  ): Promise<string> {
    const id = this.nextId('method');
    this.catalog.withPaymentMethod(userId, id, { currency: method.currency, alias: method.alias });
    this.created.push(id);

    return Promise.resolve(id);
  }

  async restorePaymentMethod(userId: string, id: string): Promise<void> {
    const found = (await this.catalog.allPaymentMethods(userId)).find((method) => method.id === id);
    if (found === undefined) throw new Error(`No payment method ${id}`);
    this.catalog.withPaymentMethod(userId, id, { currency: found.currency, alias: found.alias });
    this.restored.push(id);
  }

  private nextId(kind: string): string {
    this.sequence += 1;

    return `new-${kind}-${String(this.sequence)}`;
  }
}
