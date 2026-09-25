import { Inject, Injectable } from '@nestjs/common';
import {
  assertCategoryUsable,
  assertPaymentMethodUsable,
  assertTransactionAmount,
  assertTransactionDate,
  type Clock,
  type Currency,
  LocalDate,
  Money,
  resolveTransactionCurrency,
  today,
  type TransactionSource,
  type TransactionType,
} from '@sol-a-sol/domain';

import { EVENT_PUBLISHER, type EventPublisher } from '../../../shared/events/event-publisher.js';
import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  CategoryNotFoundError,
  PaymentMethodNotFoundError,
  TransactionNotFoundError,
} from '../domain/errors.js';
import { TRANSACTION_CREATED, type TransactionCreated } from '../domain/events.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import {
  type Transaction,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';

export interface CreateTransactionInput {
  userId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  type: TransactionType;
  categoryId: string;
  /** String decimal (`"25.90"`), para no perder precisión antes de llegar a `Money`. */
  amount: string;
  currency?: Currency | null;
  description: string;
  paymentMethodId?: string | null;
  merchant?: string | null;
  source: TransactionSource;
}

@Injectable()
export class CreateTransaction {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateTransactionInput): Promise<Transaction> {
    const { userId } = input;
    const date = LocalDate.parse(input.date);
    assertTransactionDate(date, today(this.clock));

    const category = await this.catalog.category(userId, input.categoryId);
    if (category === null) throw new CategoryNotFoundError();
    assertCategoryUsable(category, input.type);

    const paymentMethodId = input.paymentMethodId ?? null;
    const methodCurrency = await this.paymentMethodCurrency(userId, paymentMethodId);
    const currency = resolveTransactionCurrency(input.currency ?? null, methodCurrency);
    const amount = Money.of(input.amount, currency);
    assertTransactionAmount(amount);

    const created = await this.transactions.create({
      userId,
      date,
      type: input.type,
      categoryId: input.categoryId,
      amount,
      description: input.description,
      paymentMethodId,
      merchant: input.merchant ?? null,
      source: input.source,
    });
    // Después de guardar, nunca antes: quien escuche puede necesitar leerla (ADR-0004).
    const event: TransactionCreated = { userId, transactionId: created.id };
    await this.events.publish(TRANSACTION_CREATED, event);

    return created;
  }

  /** Sin método, no hay moneda de dónde tomarla. Con uno, tiene que ser propio y estar activo. */
  private async paymentMethodCurrency(
    userId: string,
    paymentMethodId: string | null,
  ): Promise<Currency | null> {
    if (paymentMethodId === null) return null;

    const method = await this.catalog.paymentMethod(userId, paymentMethodId);
    if (method === null) throw new PaymentMethodNotFoundError();
    assertPaymentMethodUsable(method);

    return method.currency;
  }
}

@Injectable()
export class GetTransaction {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<Transaction> {
    const transaction = await this.transactions.find(userId, id);
    if (transaction === null) throw new TransactionNotFoundError();

    return transaction;
  }
}
