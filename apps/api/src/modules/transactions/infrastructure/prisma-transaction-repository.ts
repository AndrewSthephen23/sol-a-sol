import { Injectable } from '@nestjs/common';
import {
  ACCENT_FOLD_FROM,
  ACCENT_FOLD_TO,
  type Currency,
  LocalDate,
  Money,
  type TypedAmount,
} from '@sol-a-sol/domain';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  NewTransaction,
  PagePosition,
  Transaction,
  TransactionChanges,
  TransactionFilter,
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

  async update(
    userId: string,
    id: string,
    changes: TransactionChanges,
  ): Promise<Transaction | null> {
    const { amount, date, ...fields } = changes;
    // `userId` y `deletedAt` van en el propio UPDATE: una ajena o una borrada no se tocan aunque
    // alguien adivine su id. La clave foránea compuesta, además, impide que tipo y categoría
    // queden distintos si la categoría cambió entre la comprobación y la escritura.
    const { count } = await this.prisma.transaction.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ...fields,
        ...(date === undefined ? {} : { date: toDatabaseDate(date) }),
        ...(amount === undefined ? {} : { amount: amount.toFixed(), currency: amount.currency }),
      },
    });
    if (count === 0) return null;

    return this.find(userId, id);
  }

  async softDelete(userId: string, id: string, deletedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.transaction.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt },
    });

    return count > 0;
  }

  /**
   * En SQL, no con `findMany`: la búsqueda sin tildes necesita `translate()`, que Prisma no
   * expresa. Todo valor viaja como parámetro (`Prisma.sql`), nunca pegado al texto de la consulta.
   */
  async list(
    userId: string,
    filter: TransactionFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transaction[]> {
    const conditions = filterConditions(userId, filter);
    if (page.after !== null) {
      // Comparar la fila entera respeta el orden (fecha, id) sin casos aparte para el empate.
      conditions.push(
        Prisma.sql`(date, id) < (${page.after.date.toString()}::date, ${page.after.id}::uuid)`,
      );
    }

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id::text AS id,
             date::text AS date,
             type::text AS type,
             category_id::text AS "categoryId",
             amount::text AS amount,
             currency::text AS currency,
             description,
             payment_method_id::text AS "paymentMethodId",
             merchant,
             source::text AS source,
             capture_id::text AS "captureId",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
        FROM transactions
       WHERE ${Prisma.join(conditions, ' AND ')}
       ORDER BY date DESC, id DESC
       LIMIT ${page.limit}`;

    return rows.map(fromRawRow);
  }

  async totals(userId: string, filter: TransactionFilter): Promise<TypedAmount[]> {
    const rows = await this.prisma.$queryRaw<
      { type: Transaction['type']; currency: Currency; amount: string }[]
    >`
      SELECT type::text AS type, currency::text AS currency, sum(amount)::text AS amount
        FROM transactions
       WHERE ${Prisma.join(filterConditions(userId, filter), ' AND ')}
       GROUP BY type, currency`;

    return rows.map((row) => ({ type: row.type, amount: Money.of(row.amount, row.currency) }));
  }

  async restore(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.transaction.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    return count > 0;
  }
}

/** Una fila de `list`, con todo convertido a texto en la consulta misma. */
interface RawRow extends Omit<Row, 'date' | 'amount'> {
  date: string;
  amount: string;
}

/**
 * Las condiciones que comparten el listado y sus totales. `user_id` y `deleted_at` van siempre:
 * no hay forma de listar sin decir de quién, ni de ver lo borrado.
 */
function filterConditions(userId: string, filter: TransactionFilter): Prisma.Sql[] {
  const conditions = [Prisma.sql`user_id = ${userId}::uuid`, Prisma.sql`deleted_at IS NULL`];
  if (filter.from !== undefined) {
    conditions.push(Prisma.sql`date >= ${filter.from.toString()}::date`);
  }
  if (filter.to !== undefined) conditions.push(Prisma.sql`date <= ${filter.to.toString()}::date`);
  if (filter.type !== undefined) conditions.push(Prisma.sql`type::text = ${filter.type}`);
  if (filter.categoryIds !== undefined) {
    const ids = filter.categoryIds.map((id) => Prisma.sql`${id}::uuid`);
    conditions.push(Prisma.sql`category_id IN (${Prisma.join(ids)})`);
  }
  if (filter.paymentMethodId !== undefined) {
    conditions.push(Prisma.sql`payment_method_id = ${filter.paymentMethodId}::uuid`);
  }
  if (filter.currency !== undefined) {
    conditions.push(Prisma.sql`currency::text = ${filter.currency}`);
  }
  if (filter.search !== undefined) conditions.push(searchCondition(filter.search));

  return conditions;
}

/**
 * La descripción o el comercio contienen el texto, sin distinguir mayúsculas ni tildes. La tabla
 * de acentos es la de `searchKey` (dominio), que ya normalizó lo buscado: la misma para los dos.
 */
function searchCondition(search: string): Prisma.Sql {
  // `%` y `_` son comodines de LIKE: buscados, valen como letras.
  const pattern = `%${search.replaceAll(/[\\%_]/gu, (char) => `\\${char}`)}%`;
  const folded = (column: Prisma.Sql): Prisma.Sql =>
    Prisma.sql`lower(translate(${column}, ${ACCENT_FOLD_FROM}, ${ACCENT_FOLD_TO})) LIKE ${pattern}`;

  return Prisma.sql`(${folded(Prisma.sql`description`)} OR ${folded(Prisma.sql`coalesce(merchant, '')`)})`;
}

function fromRawRow({ date, amount, currency, ...fields }: RawRow): Transaction {
  return {
    ...fields,
    date: LocalDate.parse(date),
    amount: Money.of(amount, currency),
  };
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
