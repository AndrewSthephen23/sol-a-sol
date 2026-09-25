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
import {
  TRANSACTION_CREATED,
  TRANSACTION_DELETED,
  TRANSACTION_RESTORED,
  TRANSACTION_UPDATED,
  type TransactionCreated,
  type TransactionDeleted,
  type TransactionRestored,
  type TransactionUpdated,
} from '../domain/events.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import {
  type Transaction,
  type TransactionChanges,
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

/** Lo que llega para corregir: solo lo que cambia. `source` no está: no se corrige. */
export interface TransactionCorrection {
  date?: string;
  type?: TransactionType;
  categoryId?: string;
  amount?: string;
  currency?: Currency;
  description?: string;
  paymentMethodId?: string | null;
  merchant?: string | null;
}

export interface UpdateTransactionInput {
  userId: string;
  id: string;
  changes: TransactionCorrection;
}

/**
 * Corrige una transacción, también de meses pasados: no existe el mes cerrado (decisión 6 de H3).
 *
 * Las reglas se aplican a la transacción **como quedaría**, no solo a lo que cambia: cambiar el
 * tipo sin cambiar la categoría la deja con una categoría de otro tipo, y eso se rechaza.
 */
@Injectable()
export class UpdateTransaction {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id, changes }: UpdateTransactionInput): Promise<Transaction> {
    const current = await this.transactions.find(userId, id);
    if (current === null) throw new TransactionNotFoundError();

    const date = this.dateOf(changes);
    await this.assertCategory(userId, current, changes);
    await this.assertPaymentMethod(userId, current, changes);
    const amount = amountOf(current, changes);

    const updated = await this.transactions.update(
      userId,
      id,
      definedOnly({
        date,
        type: changes.type,
        categoryId: changes.categoryId,
        amount,
        description: changes.description,
        paymentMethodId: changes.paymentMethodId,
        merchant: changes.merchant,
      }),
    );
    // Entre la lectura y la escritura pudo borrarse: para quien llama, simplemente no existe.
    if (updated === null) throw new TransactionNotFoundError();

    const event: TransactionUpdated = { userId, transactionId: id };
    await this.events.publish(TRANSACTION_UPDATED, event);

    return updated;
  }

  /** Una fecha nueva tampoco puede ser futura. La que ya tenía no se vuelve a juzgar. */
  private dateOf(changes: TransactionCorrection): LocalDate | undefined {
    if (changes.date === undefined) return undefined;

    const date = LocalDate.parse(changes.date);
    assertTransactionDate(date, today(this.clock));

    return date;
  }

  /**
   * Si cambia el tipo o la categoría, la categoría resultante tiene que ser de ese tipo. Una
   * archivada solo se rechaza si **se elige ahora**: la que ya tenía sigue valiendo.
   */
  private async assertCategory(
    userId: string,
    current: Transaction,
    changes: TransactionCorrection,
  ): Promise<void> {
    if (changes.type === undefined && changes.categoryId === undefined) return;

    const categoryId = changes.categoryId ?? current.categoryId;
    const category = await this.catalog.category(userId, categoryId);
    if (category === null) throw new CategoryNotFoundError();
    const kept = categoryId === current.categoryId;
    assertCategoryUsable(
      { type: category.type, archived: category.archived && !kept },
      changes.type ?? current.type,
    );
  }

  /** Un método nuevo tiene que ser propio y estar activo; el que ya tenía sigue valiendo. */
  private async assertPaymentMethod(
    userId: string,
    current: Transaction,
    changes: TransactionCorrection,
  ): Promise<void> {
    const methodId = changes.paymentMethodId;
    if (methodId === undefined || methodId === null || methodId === current.paymentMethodId) {
      return;
    }

    const method = await this.catalog.paymentMethod(userId, methodId);
    if (method === null) throw new PaymentMethodNotFoundError();
    assertPaymentMethodUsable(method);
  }
}

/**
 * El monto como quedaría, si cambia el monto o la moneda. Sin `currency`, la moneda **no cambia**,
 * aunque cambie el método de pago: 25.90 soles no se vuelven 25.90 dólares sin que nadie lo diga.
 */
function amountOf(current: Transaction, changes: TransactionCorrection): Money | undefined {
  if (changes.amount === undefined && changes.currency === undefined) return undefined;

  const amount = Money.of(
    changes.amount ?? current.amount.toFixed(),
    changes.currency ?? current.amount.currency,
  );
  assertTransactionAmount(amount);

  return amount;
}

/** Quita las claves sin valor: `undefined` es "no se tocó", `null` es "se quitó". */
function definedOnly(changes: TransactionChanges): TransactionChanges {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
}

/** Borrado lógico: la fila queda para la auditoría y se puede restaurar. */
@Injectable()
export class DeleteTransaction {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<void> {
    const deleted = await this.transactions.softDelete(userId, id, this.clock.now());
    // Una ya borrada tampoco existe: borrar dos veces no anuncia dos veces.
    if (!deleted) throw new TransactionNotFoundError();

    const event: TransactionDeleted = { userId, transactionId: id };
    await this.events.publish(TRANSACTION_DELETED, event);
  }
}

/**
 * Deshace un borrado, **sin plazo** (decidido con el autor el 2026-09-25): el aviso de
 * «Deshacer» de unos segundos es cosa de la interfaz.
 *
 * Restaurar una que no está borrada no es un error: devuelve la transacción y no anuncia nada,
 * así un doble clic en «Deshacer» no cuenta dos veces.
 */
@Injectable()
export class RestoreTransaction {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<Transaction> {
    const restored = await this.transactions.restore(userId, id);
    const transaction = await this.transactions.find(userId, id);
    if (transaction === null) throw new TransactionNotFoundError();

    if (restored) {
      const event: TransactionRestored = { userId, transactionId: id };
      await this.events.publish(TRANSACTION_RESTORED, event);
    }

    return transaction;
  }
}
