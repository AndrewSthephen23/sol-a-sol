import type { GoalTransaction, GoalTransactionsReader } from './transactions-reader.js';

/** Transacciones en memoria, cada una de una cuenta; `deleted` la esconde, como la base. */
export class FakeGoalTransactionsReader implements GoalTransactionsReader {
  private readonly transactions: {
    userId: string;
    transaction: GoalTransaction;
    deleted: boolean;
  }[] = [];

  with(userId: string, transaction: GoalTransaction, deleted = false): this {
    this.transactions.push({ userId, transaction, deleted });

    return this;
  }

  /** Corrige o borra una transacción ya registrada, como lo haría `transactions`. */
  change(id: string, changes: Partial<GoalTransaction> & { deleted?: boolean }): void {
    const entry = this.transactions.find((candidate) => candidate.transaction.id === id);
    if (entry === undefined) throw new Error(`No transaction ${id}`);
    const { deleted, ...fields } = changes;
    entry.transaction = { ...entry.transaction, ...fields };
    if (deleted !== undefined) entry.deleted = deleted;
  }

  liveTransactions(userId: string, ids: readonly string[]): Promise<GoalTransaction[]> {
    return Promise.resolve(
      this.transactions
        .filter(
          (entry) =>
            entry.userId === userId && !entry.deleted && ids.includes(entry.transaction.id),
        )
        .map((entry) => ({ ...entry.transaction })),
    );
  }
}
