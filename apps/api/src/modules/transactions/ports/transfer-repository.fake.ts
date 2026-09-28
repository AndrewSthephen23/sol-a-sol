import type { NewTransfer, Transfer, TransferRepository } from './transfer-repository.js';

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
    const row = this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt === null,
    );

    return Promise.resolve(row === undefined ? null : publicOf(row));
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
