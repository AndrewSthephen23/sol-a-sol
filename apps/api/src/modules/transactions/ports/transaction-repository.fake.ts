import { type NormalizedTag, searchKey, type TypedAmount } from '@sol-a-sol/domain';

import {
  type NewTransaction,
  newestFirst,
  orderTags,
  type PagePosition,
  type Transaction,
  type TransactionChanges,
  type TransactionFilter,
  type TransactionRepository,
} from './transaction-repository.js';

export interface FakeTransactionRow extends Omit<Transaction, 'tags'> {
  userId: string;
  deletedAt: Date | null;
  /** Ids de sus etiquetas: el nombre se lee de la etiqueta, como en la base. */
  tagIds: string[];
}

/** Una etiqueta guardada, como la fila de `tags`. */
export interface FakeTag {
  id: string;
  userId: string;
  name: string;
  key: string;
}

/**
 * Repositorio en memoria para probar los casos de uso sin base de datos. Imita las etiquetas de la
 * base: una por clave y cuenta, que se crea la primera vez y conserva su primera escritura.
 */
export class FakeTransactionRepository implements TransactionRepository {
  readonly rows: FakeTransactionRow[] = [];
  /** Las etiquetas de todas las cuentas; `FakeTagRepository` trabaja sobre las mismas. */
  readonly tags: FakeTag[] = [];
  private sequence = 0;

  constructor(private readonly now = new Date('2026-09-24T15:00:00.000Z')) {}

  create({ tags, ...transaction }: NewTransaction): Promise<Transaction> {
    this.sequence += 1;
    const row: FakeTransactionRow = {
      ...transaction,
      tagIds: this.tagIdsOf(transaction.userId, tags),
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      captureId: null,
      createdAt: this.now,
      updatedAt: this.now,
      deletedAt: null,
    };
    this.rows.push(row);

    return Promise.resolve(this.publicOf(row));
  }

  find(userId: string, id: string): Promise<Transaction | null> {
    const row = this.liveRow(userId, id);

    return Promise.resolve(row === undefined ? null : this.publicOf(row));
  }

  update(
    userId: string,
    id: string,
    { tags, ...changes }: TransactionChanges,
  ): Promise<Transaction | null> {
    const row = this.liveRow(userId, id);
    if (row === undefined) return Promise.resolve(null);
    Object.assign(row, changes, { updatedAt: this.now });
    if (tags !== undefined) row.tagIds = this.tagIdsOf(userId, tags);

    return Promise.resolve(this.publicOf(row));
  }

  softDelete(userId: string, id: string, deletedAt: Date): Promise<boolean> {
    const row = this.liveRow(userId, id);
    if (row === undefined) return Promise.resolve(false);
    row.deletedAt = deletedAt;

    return Promise.resolve(true);
  }

  restore(userId: string, id: string): Promise<boolean> {
    const row = this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt !== null,
    );
    if (row === undefined) return Promise.resolve(false);
    row.deletedAt = null;

    return Promise.resolve(true);
  }

  list(
    userId: string,
    filter: TransactionFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transaction[]> {
    const { after } = page;

    return Promise.resolve(
      this.matching(userId, filter)
        .toSorted(newestFirst)
        .filter((row) => after === null || newestFirst(row, after) > 0)
        .slice(0, page.limit)
        .map((row) => this.publicOf(row)),
    );
  }

  totals(userId: string, filter: TransactionFilter): Promise<TypedAmount[]> {
    return Promise.resolve(
      this.matching(userId, filter).map((row) => ({
        type: row.type,
        amount: row.amount,
        count: 1,
      })),
    );
  }

  reassignCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    const moved = this.rows.filter((row) => row.userId === userId && row.categoryId === fromId);
    for (const row of moved) row.categoryId = intoId;

    return Promise.resolve(moved.length);
  }

  private matching(userId: string, filter: TransactionFilter): FakeTransactionRow[] {
    return this.rows.filter(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        (filter.from === undefined || !row.date.isBefore(filter.from)) &&
        (filter.to === undefined || !row.date.isAfter(filter.to)) &&
        (filter.type === undefined || row.type === filter.type) &&
        (filter.categoryIds === undefined || filter.categoryIds.includes(row.categoryId)) &&
        (filter.paymentMethodId === undefined || row.paymentMethodId === filter.paymentMethodId) &&
        (filter.currency === undefined || row.amount.currency === filter.currency) &&
        (filter.search === undefined ||
          [row.description, row.merchant ?? ''].some((text) =>
            searchKey(text).includes(filter.search ?? ''),
          )) &&
        (filter.tagKey === undefined ||
          this.tags.some((tag) => row.tagIds.includes(tag.id) && tag.key === filter.tagKey)),
    );
  }

  /** Crea las etiquetas que la cuenta no tiene y devuelve los ids de todas. */
  private tagIdsOf(userId: string, tags: readonly NormalizedTag[]): string[] {
    return tags.map(({ name, key }) => {
      const existing = this.tags.find((tag) => tag.userId === userId && tag.key === key);
      if (existing !== undefined) return existing.id;
      const created = { id: `tag-${String(this.tags.length + 1)}`, userId, name, key };
      this.tags.push(created);

      return created.id;
    });
  }

  /** Una copia sin `userId` ni `deletedAt`, como la que devuelve el adaptador de Prisma. */
  private publicOf(row: FakeTransactionRow): Transaction {
    return {
      id: row.id,
      date: row.date,
      type: row.type,
      categoryId: row.categoryId,
      amount: row.amount,
      description: row.description,
      paymentMethodId: row.paymentMethodId,
      merchant: row.merchant,
      source: row.source,
      captureId: row.captureId,
      tags: orderTags(
        this.tags.filter((tag) => row.tagIds.includes(tag.id)).map((tag) => tag.name),
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private liveRow(userId: string, id: string): FakeTransactionRow | undefined {
    return this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt === null,
    );
  }
}
