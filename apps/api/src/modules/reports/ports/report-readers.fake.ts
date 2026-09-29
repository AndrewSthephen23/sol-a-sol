import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import type { ReportActualsReader, ReportCatalogReader } from './report-readers.js';

interface FakeTransaction {
  userId: string;
  date: LocalDate;
  categoryId: string;
  type: TransactionType;
  amount: Money;
}

/** Transacciones en memoria, ya sin borradas ni transferencias, como las entrega `transactions`. */
export class FakeReportActualsReader implements ReportActualsReader {
  private readonly transactions: FakeTransaction[] = [];

  with(transaction: FakeTransaction): this {
    this.transactions.push(transaction);

    return this;
  }

  totalsByCategory(userId: string, from: LocalDate, to: LocalDate) {
    return Promise.resolve(
      this.inRange(userId, from, to).map(({ categoryId, type, amount }) => ({
        categoryId,
        type,
        amount,
      })),
    );
  }

  totalsByDay(userId: string, from: LocalDate, to: LocalDate) {
    return Promise.resolve(
      this.inRange(userId, from, to).map(({ date, type, amount }) => ({ date, type, amount })),
    );
  }

  private inRange(userId: string, from: LocalDate, to: LocalDate): FakeTransaction[] {
    return this.transactions.filter(
      (transaction) =>
        transaction.userId === userId &&
        !transaction.date.isBefore(from) &&
        !transaction.date.isAfter(to),
    );
  }
}

/** Categorías en memoria, por cuenta. */
export class FakeReportCatalogReader implements ReportCatalogReader {
  private readonly categories: { userId: string; id: string; parentId: string | null }[] = [];

  with(userId: string, id: string, parentId: string | null = null): this {
    this.categories.push({ userId, id, parentId });

    return this;
  }

  allCategories(userId: string) {
    return Promise.resolve(
      this.categories
        .filter((category) => category.userId === userId)
        .map(({ id, parentId }) => ({ id, parentId })),
    );
  }
}
