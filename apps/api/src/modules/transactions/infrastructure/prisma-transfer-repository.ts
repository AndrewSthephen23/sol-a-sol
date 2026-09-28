import { Injectable } from '@nestjs/common';
import { type Currency, Money } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NewTransfer, Transfer, TransferRepository } from '../ports/transfer-repository.js';
import { fromDatabaseDate, toDatabaseDate } from './database-date.js';

/** `select` explícito: ni `userId` ni `deletedAt` salen de aquí. */
const PUBLIC_FIELDS = {
  id: true,
  date: true,
  fromPaymentMethodId: true,
  toPaymentMethodId: true,
  amount: true,
  currency: true,
  receivedAmount: true,
  receivedCurrency: true,
  description: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface Row {
  id: string;
  date: Date;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  amount: { toFixed(decimalPlaces: number): string };
  currency: Currency;
  receivedAmount: { toFixed(decimalPlaces: number): string };
  receivedCurrency: Currency;
  description: string;
  source: Transfer['source'];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(transfer: NewTransfer): Promise<Transfer> {
    const { amount, receivedAmount, date, ...fields } = transfer;
    const row = await this.prisma.transfer.create({
      data: {
        ...fields,
        date: toDatabaseDate(date),
        // Como texto: pasar por `number` perdería céntimos antes de llegar a NUMERIC(18,2).
        amount: amount.toFixed(),
        currency: amount.currency,
        receivedAmount: receivedAmount.toFixed(),
        receivedCurrency: receivedAmount.currency,
      },
      select: PUBLIC_FIELDS,
    });

    return toTransfer(row);
  }

  async find(userId: string, id: string): Promise<Transfer | null> {
    const row = await this.prisma.transfer.findFirst({
      where: { id, userId, deletedAt: null },
      select: PUBLIC_FIELDS,
    });

    return row === null ? null : toTransfer(row);
  }
}

function toTransfer({
  amount,
  currency,
  receivedAmount,
  receivedCurrency,
  date,
  ...fields
}: Row): Transfer {
  return {
    ...fields,
    date: fromDatabaseDate(date),
    amount: Money.of(amount.toFixed(2), currency),
    receivedAmount: Money.of(receivedAmount.toFixed(2), receivedCurrency),
  };
}
