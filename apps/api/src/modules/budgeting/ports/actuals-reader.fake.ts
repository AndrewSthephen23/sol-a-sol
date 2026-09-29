import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import type { BudgetActualsReader } from './actuals-reader.js';

interface FakeTransaction {
  userId: string;
  date: LocalDate;
  categoryId: string;
  type: TransactionType;
  amount: Money;
}

/** Transacciones en memoria, ya sin borradas ni transferencias, como las entrega `transactions`. */
export class FakeBudgetActualsReader implements BudgetActualsReader {
  private readonly transactions: FakeTransaction[] = [];

  with(transaction: FakeTransaction): this {
    this.transactions.push(transaction);

    return this;
  }

  totalsByCategory(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ categoryId: string; type: TransactionType; amount: Money }[]> {
    return Promise.resolve(
      this.transactions
        .filter(
          (transaction) =>
            transaction.userId === userId &&
            !transaction.date.isBefore(from) &&
            !transaction.date.isAfter(to),
        )
        .map(({ categoryId, type, amount }) => ({ categoryId, type, amount })),
    );
  }
}
