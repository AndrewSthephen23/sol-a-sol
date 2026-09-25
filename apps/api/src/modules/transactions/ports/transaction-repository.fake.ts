import type {
  NewTransaction,
  Transaction,
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
    const row = this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === id && candidate.deletedAt === null,
    );

    return Promise.resolve(row === undefined ? null : publicOf(row));
  }
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
