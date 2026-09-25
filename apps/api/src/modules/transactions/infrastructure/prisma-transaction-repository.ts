import { Injectable } from '@nestjs/common';
import { type Currency, LocalDate, Money } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  NewTransaction,
  Transaction,
  TransactionRepository,
} from '../ports/transaction-repository.js';

/** `select` explícito: ni `userId` ni `deletedAt` salen de aquí. */
const PUBLIC_FIELDS = {
  id: true,
  date: true,
  type: true,
  categoryId: true,
  amount: true,
  currency: true,
  description: true,
  paymentMethodId: true,
  merchant: true,
  source: true,
  captureId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** La fila tal como la devuelve Prisma con `PUBLIC_FIELDS`. */
interface Row {
  id: string;
  date: Date;
  type: Transaction['type'];
  categoryId: string;
  amount: { toFixed(decimalPlaces: number): string };
  currency: Currency;
  description: string;
  paymentMethodId: string | null;
  merchant: string | null;
  source: Transaction['source'];
  captureId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(transaction: NewTransaction): Promise<Transaction> {
    const { amount, date, ...fields } = transaction;
    const row = await this.prisma.transaction.create({
      data: {
        ...fields,
        date: toDatabaseDate(date),
        // Como texto: pasar por `number` perdería céntimos antes de llegar a NUMERIC(18,2).
        amount: amount.toFixed(),
        currency: amount.currency,
      },
      select: PUBLIC_FIELDS,
    });

    return toTransaction(row);
  }

  async find(userId: string, id: string): Promise<Transaction | null> {
    // `userId` y `deletedAt` van en el mismo WHERE: una ajena o una borrada simplemente no existen.
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      select: PUBLIC_FIELDS,
    });

    return row === null ? null : toTransaction(row);
  }
}

/**
 * Una columna `DATE` llega y sale como la medianoche **UTC** de ese día. Se arma y se lee en UTC
 * para que la zona del servidor no la corra un día.
 */
function toDatabaseDate(date: LocalDate): Date {
  return new Date(`${date.toString()}T00:00:00.000Z`);
}

function fromDatabaseDate(date: Date): LocalDate {
  return LocalDate.parse(date.toISOString().slice(0, 10));
}

function toTransaction({ amount, currency, date, ...fields }: Row): Transaction {
  return {
    ...fields,
    date: fromDatabaseDate(date),
    // NUMERIC(18,2) ya trae dos decimales: el texto entra a `Money` sin redondear nada.
    amount: Money.of(amount.toFixed(2), currency),
  };
}
