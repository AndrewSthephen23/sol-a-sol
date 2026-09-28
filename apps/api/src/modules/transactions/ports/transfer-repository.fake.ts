import { searchKey } from '@sol-a-sol/domain';

import { newestFirst, type PagePosition } from './transaction-repository.js';
import type {
  NewTransfer,
  Transfer,
  TransferChanges,
  TransferFilter,
  TransferRepository,
} from './transfer-repository.js';

interface Row extends Transfer {
  userId: string;
  deletedAt: Date | null;
}

/** Repositorio en memoria para probar los casos de uso sin base de datos. */
export class FakeTransferRepository implements TransferRepository {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(private readonly now = new Date('2026-09-24T15:00:00.000Z')) {}

  create(transfer: NewTransfer): Promise<Transfer> {
    this.sequence += 1;
    const row: Row = {
      ...transfer,
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      createdAt: this.now,
      updatedAt: this.now,
      deletedAt: null,
    };
    this.rows.push(row);

    return Promise.resolve(publicOf(row));
  }

  find(userId: string, id: string): Promise<Transfer | null> {
    const row = this.liveRow(userId, id);

    return Promise.resolve(row === undefined ? null : publicOf(row));
  }

  list(
    userId: string,
    filter: TransferFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transfer[]> {
    const { after } = page;
    const matches = (row: Row): boolean =>
      row.userId === userId &&
      row.deletedAt === null &&
      (filter.from === undefined || !row.date.isBefore(filter.from)) &&
      (filter.to === undefined || !row.date.isAfter(filter.to)) &&
      (filter.paymentMethodId === undefined ||
        [row.fromPaymentMethodId, row.toPaymentMethodId].includes(filter.paymentMethodId)) &&
      (filter.currency === undefined ||
        [row.amount.currency, row.receivedAmount.currency].includes(filter.currency)) &&
      (filter.search === undefined || searchKey(row.description).includes(filter.search));

    return Promise.resolve(
      this.rows
        .filter(matches)
        .toSorted(newestFirst)
        .filter((row) => after === null || newestFirst(row, after) > 0)
        .slice(0, page.limit)
        .map(publicOf),
    );
  }
  update(userId: string, id: string, changes: TransferChanges): Promise<Transfer | null> {
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

  private liveRow(userId: string, id: string): Row | undefined {
    return this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt === null,
    );
  }
}

/** Una copia sin `userId` ni `deletedAt`, como la que devuelve el adaptador de Prisma. */
function publicOf(row: Row): Transfer {
  return {
    id: row.id,
    date: row.date,
    fromPaymentMethodId: row.fromPaymentMethodId,
    toPaymentMethodId: row.toPaymentMethodId,
    amount: row.amount,
    receivedAmount: row.receivedAmount,
    description: row.description,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
