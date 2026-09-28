import { Inject, Injectable } from '@nestjs/common';
import {
  assertDistinctAccounts,
  assertPaymentMethodUsable,
  assertTransactionDate,
  type Clock,
  type Currency,
  LocalDate,
  resolveTransferAmounts,
  today,
  type TransactionSource,
  type TransferAccount,
} from '@sol-a-sol/domain';

import { EVENT_PUBLISHER, type EventPublisher } from '../../../shared/events/event-publisher.js';
import { CLOCK } from '../../../shared/time/system-clock.js';
import { PaymentMethodNotFoundError, TransferNotFoundError } from '../domain/errors.js';
import {
  TRANSFER_CREATED,
  TRANSFER_DELETED,
  TRANSFER_RESTORED,
  TRANSFER_UPDATED,
  type TransferCreated,
  type TransferDeleted,
  type TransferRestored,
  type TransferUpdated,
} from '../domain/events.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import {
  type Transfer,
  type TransferChanges,
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from '../ports/transfer-repository.js';

export interface CreateTransferInput {
  userId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  /** Strings decimales, para no perder precisión antes de llegar a `Money`. */
  amount: string;
  currency?: Currency;
  receivedAmount?: string;
  receivedCurrency?: Currency;
  description: string;
  source: TransactionSource;
}

/**
 * Registra plata que pasó de una cuenta propia a otra. No es ingreso ni gasto: no entra en los
 * totales. Las dos cuentas tienen que ser propias, distintas y estar activas.
 */
@Injectable()
export class CreateTransfer {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateTransferInput): Promise<Transfer> {
    const { userId } = input;
    const date = LocalDate.parse(input.date);
    assertTransactionDate(date, today(this.clock));
    assertDistinctAccounts(input.fromPaymentMethodId, input.toPaymentMethodId);

    const from = await this.account(userId, input.fromPaymentMethodId);
    const to = await this.account(userId, input.toPaymentMethodId);
    const { sent, received } = resolveTransferAmounts(
      {
        amount: input.amount,
        currency: input.currency ?? null,
        receivedAmount: input.receivedAmount ?? null,
        receivedCurrency: input.receivedCurrency ?? null,
      },
      from,
      to,
    );

    const created = await this.transfers.create({
      userId,
      date,
      fromPaymentMethodId: input.fromPaymentMethodId,
      toPaymentMethodId: input.toPaymentMethodId,
      amount: sent,
      receivedAmount: received,
      description: input.description,
      source: input.source,
    });
    // Después de guardar, nunca antes (ADR-0004).
    const event: TransferCreated = { userId, transferId: created.id };
    await this.events.publish(TRANSFER_CREATED, event);

    return created;
  }

  /** Propia y activa; si no existe o es ajena, 404 sin decir cuál de las dos. */
  private async account(userId: string, id: string): Promise<TransferAccount> {
    const method = await this.catalog.paymentMethod(userId, id);
    if (method === null) throw new PaymentMethodNotFoundError();
    assertPaymentMethodUsable(method);

    return method;
  }
}

@Injectable()
export class GetTransfer {
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<Transfer> {
    const transfer = await this.transfers.find(userId, id);
    if (transfer === null) throw new TransferNotFoundError();

    return transfer;
  }
}

/** Lo que llega para corregir: solo lo que cambia. `source` no está: no se corrige. */
export interface TransferCorrection {
  date?: string;
  fromPaymentMethodId?: string;
  toPaymentMethodId?: string;
  amount?: string;
  currency?: Currency;
  receivedAmount?: string;
  receivedCurrency?: Currency;
  description?: string;
}

/**
 * Corrige una transferencia, también de meses pasados. Las reglas se aplican a la transferencia
 * **como quedaría**: las cuentas resultantes, sus monedas y los montos resultantes.
 *
 * - Una cuenta archivada que ya tenía sigue valiendo; elegirla ahora, no.
 * - Una cuenta que cambia deja de imponer su moneda: se toma la de la cuenta nueva.
 * - En un cambio de moneda, corregir el monto enviado exige mandar también el recibido: cambiar
 *   uno solo movería el tipo de cambio sin que nadie lo diga (decidido el 2026-09-28).
 */
@Injectable()
export class UpdateTransfer {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({
    userId,
    id,
    changes,
  }: {
    userId: string;
    id: string;
    changes: TransferCorrection;
  }): Promise<Transfer> {
    const current = await this.transfers.find(userId, id);
    if (current === null) throw new TransferNotFoundError();

    const updated = await this.transfers.update(userId, id, {
      ...this.dateOf(changes),
      ...(await this.moneyOf(userId, current, changes)),
      ...(changes.description === undefined ? {} : { description: changes.description }),
    });
    // Entre la lectura y la escritura pudo borrarse: para quien llama, simplemente no existe.
    if (updated === null) throw new TransferNotFoundError();

    const event: TransferUpdated = { userId, transferId: id };
    await this.events.publish(TRANSFER_UPDATED, event);

    return updated;
  }

  private dateOf(changes: TransferCorrection): Pick<TransferChanges, 'date'> {
    if (changes.date === undefined) return {};

    const date = LocalDate.parse(changes.date);
    assertTransactionDate(date, today(this.clock));

    return { date };
  }

  /** Cuentas y montos como quedarían. Sin cambios en ellos, no se tocan. */
  private async moneyOf(
    userId: string,
    current: Transfer,
    changes: TransferCorrection,
  ): Promise<TransferChanges> {
    const { fromPaymentMethodId, toPaymentMethodId, amount, currency, receivedAmount } = changes;
    const touched = [
      fromPaymentMethodId,
      toPaymentMethodId,
      amount,
      currency,
      receivedAmount,
      changes.receivedCurrency,
    ].some((value) => value !== undefined);
    if (!touched) return {};

    const fromId = fromPaymentMethodId ?? current.fromPaymentMethodId;
    const toId = toPaymentMethodId ?? current.toPaymentMethodId;
    assertDistinctAccounts(fromId, toId);
    const from = await this.account(userId, fromId, fromId !== current.fromPaymentMethodId);
    const to = await this.account(userId, toId, toId !== current.toPaymentMethodId);

    // El recibido de un cambio de moneda se conserva solo si el enviado no cambia y sigue
    // llegando en la misma moneda (otra cuenta en dólares, por ejemplo).
    const wasExchange = current.amount.currency !== current.receivedAmount.currency;
    // Un destino que acepta las dos monedas (efectivo) sigue recibiendo la del cambio si lo era;
    // si no, recibe la que sale.
    const receivedCurrency =
      changes.receivedCurrency ??
      to.currency ??
      (toPaymentMethodId === undefined && wasExchange ? current.receivedAmount.currency : null);
    const keepsReceived =
      amount === undefined && wasExchange && receivedCurrency === current.receivedAmount.currency;
    const { sent, received } = resolveTransferAmounts(
      {
        amount: amount ?? current.amount.toFixed(),
        // Una cuenta nueva pone su moneda; la que no cambia conserva la que tenía.
        currency: currency ?? (fromPaymentMethodId === undefined ? current.amount.currency : null),
        receivedAmount: receivedAmount ?? (keepsReceived ? current.receivedAmount.toFixed() : null),
        receivedCurrency,
      },
      from,
      to,
    );

    return {
      fromPaymentMethodId: fromId,
      toPaymentMethodId: toId,
      amount: sent,
      receivedAmount: received,
    };
  }

  /** Propia; activa solo si se elige ahora. La que ya tenía sigue valiendo aunque se archive. */
  private async account(userId: string, id: string, chosenNow: boolean): Promise<TransferAccount> {
    const method = await this.catalog.paymentMethod(userId, id);
    if (method === null) throw new PaymentMethodNotFoundError();
    if (chosenNow) assertPaymentMethodUsable(method);

    return method;
  }
}

/** Borrado lógico: la fila queda para la auditoría y se puede restaurar. */
@Injectable()
export class DeleteTransfer {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<void> {
    const deleted = await this.transfers.softDelete(userId, id, this.clock.now());
    if (!deleted) throw new TransferNotFoundError();

    const event: TransferDeleted = { userId, transferId: id };
    await this.events.publish(TRANSFER_DELETED, event);
  }
}

/**
 * Deshace un borrado, sin plazo. Con una que no está borrada, la devuelve y no anuncia nada, como
 * las transacciones.
 */
@Injectable()
export class RestoreTransfer {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<Transfer> {
    const restored = await this.transfers.restore(userId, id);
    const transfer = await this.transfers.find(userId, id);
    if (transfer === null) throw new TransferNotFoundError();

    if (restored) {
      const event: TransferRestored = { userId, transferId: id };
      await this.events.publish(TRANSFER_RESTORED, event);
    }

    return transfer;
  }
}
