import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import type {
  ReportActualsReader,
  ReportBudgetReader,
  ReportCard,
  ReportCardsReader,
  ReportCatalogReader,
  ReportFeatureFlags,
  ReportGoal,
  ReportGoalsReader,
  SummarySection,
} from './report-readers.js';

interface FakeTransaction {
  userId: string;
  date: LocalDate;
  categoryId: string;
  type: TransactionType;
  amount: Money;
  merchant?: string;
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

  totalsByMerchant(userId: string, from: LocalDate, to: LocalDate) {
    return Promise.resolve(
      this.inRange(userId, from, to).flatMap(({ merchant, type, amount }) =>
        merchant === undefined ? [] : [{ merchant, type, amount, count: 1 }],
      ),
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
  private readonly categories: {
    userId: string;
    id: string;
    name: string;
    parentId: string | null;
  }[] = [];

  /** Sin nombre, se llama como su id. */
  with(userId: string, id: string, parentId: string | null = null, name = id): this {
    this.categories.push({ userId, id, name, parentId });

    return this;
  }

  allCategories(userId: string) {
    return Promise.resolve(
      this.categories
        .filter((category) => category.userId === userId)
        .map(({ id, name, parentId }) => ({ id, name, parentId })),
    );
  }
}

/** Lo que se consulta de un módulo: cada llamada se anota, para comprobar que uno apagado no se toca. */
abstract class CountingReader {
  calls = 0;

  protected count(): void {
    this.calls += 1;
  }
}

/** Partidas en memoria, por cuenta y mes. */
export class FakeReportBudgetReader extends CountingReader implements ReportBudgetReader {
  private readonly entries: {
    userId: string;
    year: number;
    month: number;
    line: { categoryId: string; type: TransactionType; planned: Money };
  }[] = [];

  with(
    userId: string,
    year: number,
    month: number,
    line: { categoryId: string; type: TransactionType; planned: Money },
  ): this {
    this.entries.push({ userId, year, month, line });

    return this;
  }

  lines(userId: string, year: number, month: number) {
    this.count();

    return Promise.resolve(
      this.entries
        .filter((entry) => entry.userId === userId && entry.year === year && entry.month === month)
        .map((entry) => entry.line),
    );
  }
}

/** Tarjetas en memoria, por cuenta, ya calculadas para el periodo que se pida. */
export class FakeReportCardsReader extends CountingReader implements ReportCardsReader {
  private readonly cards: { userId: string; card: ReportCard }[] = [];
  /** El último periodo pedido. */
  asked: { from: LocalDate; to: LocalDate } | null = null;

  with(userId: string, card: ReportCard): this {
    this.cards.push({ userId, card });

    return this;
  }

  monthlyCards(userId: string, from: LocalDate, to: LocalDate) {
    this.count();
    this.asked = { from, to };

    return Promise.resolve(
      this.cards.filter((entry) => entry.userId === userId).map((entry) => entry.card),
    );
  }
}

/** Metas en memoria, por cuenta. */
export class FakeReportGoalsReader extends CountingReader implements ReportGoalsReader {
  private readonly goals: { userId: string; goal: ReportGoal }[] = [];

  with(userId: string, goal: ReportGoal): this {
    this.goals.push({ userId, goal });

    return this;
  }

  goalsWithMovements(userId: string) {
    this.count();

    return Promise.resolve(
      this.goals.filter((entry) => entry.userId === userId).map((entry) => entry.goal),
    );
  }
}

/** Flags en memoria: todos encendidos salvo los que se apagan. */
export class FakeReportFeatureFlags implements ReportFeatureFlags {
  private readonly off = new Set<SummarySection>();

  turnOff(module: SummarySection): this {
    this.off.add(module);

    return this;
  }

  isEnabled(module: SummarySection): boolean {
    return !this.off.has(module);
  }
}
