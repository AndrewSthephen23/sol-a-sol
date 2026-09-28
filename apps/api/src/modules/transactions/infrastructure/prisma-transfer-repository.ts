import { Injectable } from '@nestjs/common';
import { type Currency, LocalDate, Money } from '@sol-a-sol/domain';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { PagePosition } from '../ports/transaction-repository.js';
import type {
  NewTransfer,
  Transfer,
  TransferChanges,
  TransferFilter,
  TransferRepository,
} from '../ports/transfer-repository.js';
import { fromDatabaseDate, toDatabaseDate } from './database-date.js';
import { afterPosition, containsText } from './sql-conditions.js';

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

  async importedKeys(userId: string, keys: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.transfer.findMany({
      where: { userId, importKey: { in: [...keys] } },
      select: { importKey: true },
    });

    return rows.flatMap((row) => (row.importKey === null ? [] : [row.importKey]));
  }

  /** En SQL parametrizado, como el de transacciones: la búsqueda sin tildes lo necesita. */
  async list(
    userId: string,
    filter: TransferFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transfer[]> {
    const conditions = filterConditions(userId, filter);
    if (page.after !== null) conditions.push(afterPosition(page.after));

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id::text AS id,
             date::text AS date,
             from_payment_method_id::text AS "fromPaymentMethodId",
             to_payment_method_id::text AS "toPaymentMethodId",
             amount::text AS amount,
             currency::text AS currency,
             received_amount::text AS "receivedAmount",
             received_currency::text AS "receivedCurrency",
             description,
             source::text AS source,
             created_at AS "createdAt",
             updated_at AS "updatedAt"
        FROM transfers
       WHERE ${Prisma.join(conditions, ' AND ')}
       ORDER BY date DESC, id DESC
       LIMIT ${page.limit}`;

    return rows.map(fromRawRow);
  }

  async update(userId: string, id: string, changes: TransferChanges): Promise<Transfer | null> {
    const { amount, receivedAmount, date, ...fields } = changes;
    // `userId` y `deletedAt` van en el propio UPDATE. Las claves foráneas compuestas impiden
    // además apuntar a la cuenta de otro usuario, y los CHECK, dejar montos incoherentes.
    const { count } = await this.prisma.transfer.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ...fields,
        ...(date === undefined ? {} : { date: toDatabaseDate(date) }),
        ...(amount === undefined ? {} : { amount: amount.toFixed(), currency: amount.currency }),
        ...(receivedAmount === undefined
          ? {}
          : {
              receivedAmount: receivedAmount.toFixed(),
              receivedCurrency: receivedAmount.currency,
            }),
      },
    });
    if (count === 0) return null;

    return this.find(userId, id);
  }

  async softDelete(userId: string, id: string, deletedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.transfer.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt },
    });

    return count > 0;
  }

  async restore(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.transfer.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    return count > 0;
  }
}

/** Una fila de `list`, con todo convertido a texto en la consulta misma. */
interface RawRow extends Omit<Row, 'date' | 'amount' | 'receivedAmount'> {
  date: string;
  amount: string;
  receivedAmount: string;
}

/** `user_id` y `deleted_at` van siempre: no hay forma de listar sin decir de quién. */
function filterConditions(userId: string, filter: TransferFilter): Prisma.Sql[] {
  const conditions = [Prisma.sql`user_id = ${userId}::uuid`, Prisma.sql`deleted_at IS NULL`];
  if (filter.from !== undefined) {
    conditions.push(Prisma.sql`date >= ${filter.from.toString()}::date`);
  }
  if (filter.to !== undefined) conditions.push(Prisma.sql`date <= ${filter.to.toString()}::date`);
  if (filter.paymentMethodId !== undefined) {
    const id = Prisma.sql`${filter.paymentMethodId}::uuid`;
    conditions.push(Prisma.sql`(from_payment_method_id = ${id} OR to_payment_method_id = ${id})`);
  }
  if (filter.currency !== undefined) {
    const currency = filter.currency;
    conditions.push(
      Prisma.sql`(currency::text = ${currency} OR received_currency::text = ${currency})`,
    );
  }
  if (filter.search !== undefined) {
    conditions.push(containsText([Prisma.sql`description`], filter.search));
  }

  return conditions;
}

function fromRawRow({
  date,
  amount,
  currency,
  receivedAmount,
  receivedCurrency,
  ...fields
}: RawRow): Transfer {
  return {
    ...fields,
    date: LocalDate.parse(date),
    amount: Money.of(amount, currency),
    receivedAmount: Money.of(receivedAmount, receivedCurrency),
  };
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
