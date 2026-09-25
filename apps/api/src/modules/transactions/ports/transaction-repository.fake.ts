import { searchKey, type TypedAmount } from '@sol-a-sol/domain';

import type {
  NewTransaction,
  PagePosition,
  Transaction,
  TransactionChanges,
  TransactionFilter,
  TransactionRepository,
} from './transaction-repository.js';

interface Row extends Transaction {
  userId: string;
  deletedAt: Date | null;
}

/** Repositorio en memoria para probar los casos de uso sin base de datos. */
export class FakeTransactionRepository implements TransactionRepository {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(private readonly now = new Date('2026-09-24T15:00:00.000Z')) {}

  create(transaction: NewTransaction): Promise<Transaction> {
    this.sequence += 1;
    const row: Row = {
      ...transaction,
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      captureId: null,
      createdAt: this.now,
      updatedAt: this.now,
      deletedAt: null,
    };
    this.rows.push(row);

    return Promise.resolve(publicOf(row));
  }

  find(userId: string, id: string): Promise<Transaction | null> {
    const row = this.liveRow(userId, id);

    return Promise.resolve(row === undefined ? null : publicOf(row));
  }

  update(userId: string, id: string, changes: TransactionChanges): Promise<Transaction | null> {
    const row = this.liveRow(userId, id);
    if (row === undefined) return Promise.resolve(null);
    Object.assign(row, changes, { updatedAt: this.now });

    return Promise.resolve(publicOf(row));
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
        .map(publicOf),
    );
  }

  totals(userId: string, filter: TransactionFilter): Promise<TypedAmount[]> {
    return Promise.resolve(
      this.matching(userId, filter).map((row) => ({ type: row.type, amount: row.amount })),
    );
  }

  private matching(userId: string, filter: TransactionFilter): Row[] {
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
          )),
    );
  }

  private liveRow(userId: string, id: string): Row | undefined {
    return this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt === null,
    );
  }
}

/** Negativo si `a` va antes que `b` en el listado: fecha descendente y, luego, id descendente. */
function newestFirst(a: PagePosition, b: PagePosition): number {
  return b.date.compareTo(a.date) || b.id.localeCompare(a.id);
}

/** Una copia sin `userId` ni `deletedAt`, como la que devuelve el adaptador de Prisma. */
function publicOf(row: Row): Transaction {
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
