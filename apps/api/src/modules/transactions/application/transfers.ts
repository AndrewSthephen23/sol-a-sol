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
import { TRANSFER_CREATED, type TransferCreated } from '../domain/events.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import {
  type Transfer,
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
