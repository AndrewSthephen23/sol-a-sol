import { Injectable } from '@nestjs/common';
import {
  type Currency,
  LocalDate,
  Money,
  type NormalizedTag,
  type TypedAmount,
} from '@sol-a-sol/domain';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type NewTransaction,
  orderTags,
  type PagePosition,
  type Transaction,
  type TransactionChanges,
  type TransactionFilter,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import { fromDatabaseDate, toDatabaseDate } from './database-date.js';
import { afterPosition, containsText } from './sql-conditions.js';

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
  tags: { select: { tag: { select: { name: true } } } },
} as const;

/** La fila tal como la devuelve Prisma con `PUBLIC_FIELDS`. */
/** Lo que usan estas funciones del cliente: el de Prisma o el de una transacción de la base. */
type Client = Pick<PrismaService, 'transaction' | 'tag' | 'transactionTag'>;

/** `userId` y `deletedAt` van en el mismo WHERE: una ajena o una borrada simplemente no existen. */
async function findIn(client: Client, userId: string, id: string): Promise<Transaction | null> {
  const row = await client.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    select: PUBLIC_FIELDS,
  });

  return row === null ? null : toTransaction(row);
}

/**
 * Crea las etiquetas que la cuenta no tiene y las liga a la transacción. `skipDuplicates` deja
 * que el índice único `(user_id, name_key)` decida: dos peticiones que crean la misma etiqueta a
 * la vez no chocan, y la que ya existía conserva su primera escritura.
 */
async function linkTags(
  client: Client,
  userId: string,
  transactionId: string,
  tags: readonly NormalizedTag[],
): Promise<void> {
  if (tags.length === 0) return;

  await client.tag.createMany({
    data: tags.map((tag) => ({ userId, name: tag.name, nameKey: tag.key })),
    skipDuplicates: true,
  });
  const ids = await client.tag.findMany({
    where: { userId, nameKey: { in: tags.map((tag) => tag.key) } },
    select: { id: true },
  });
  await client.transactionTag.createMany({
    data: ids.map(({ id }) => ({ transactionId, tagId: id, userId })),
  });
}

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
  tags: { tag: { name: string } }[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** La fila y sus etiquetas en una sola transacción de la base: o queda todo, o nada. */
  async create({ tags, amount, date, ...fields }: NewTransaction): Promise<Transaction> {
    return this.prisma.$transaction(async (client) => {
      const { id } = await client.transaction.create({
        data: {
          ...fields,
          date: toDatabaseDate(date),
          // Como texto: pasar por `number` perdería céntimos antes de llegar a NUMERIC(18,2).
          amount: amount.toFixed(),
          currency: amount.currency,
        },
        select: { id: true },
      });
      await linkTags(client, fields.userId, id, tags);
      const created = await findIn(client, fields.userId, id);
      if (created === null) throw new Error(`Transaction ${id} vanished inside its own write.`);

      return created;
    });
  }

  async find(userId: string, id: string): Promise<Transaction | null> {
    return findIn(this.prisma, userId, id);
  }

  async update(
    userId: string,
    id: string,
    { tags, amount, date, ...fields }: TransactionChanges,
  ): Promise<Transaction | null> {
    return this.prisma.$transaction(async (client) => {
      // `userId` y `deletedAt` van en el propio UPDATE: una ajena o una borrada no se tocan aunque
      // alguien adivine su id. La clave foránea compuesta, además, impide que tipo y categoría
      // queden distintos si la categoría cambió entre la comprobación y la escritura.
      const { count } = await client.transaction.updateMany({
        where: { id, userId, deletedAt: null },
        data: {
          ...fields,
          ...(date === undefined ? {} : { date: toDatabaseDate(date) }),
          ...(amount === undefined ? {} : { amount: amount.toFixed(), currency: amount.currency }),
        },
      });
      if (count === 0) return null;
      if (tags !== undefined) {
        // Las etiquetas se reemplazan: se quitan todas y se ponen las nuevas.
        await client.transactionTag.deleteMany({ where: { transactionId: id, userId } });
        await linkTags(client, userId, id, tags);
      }

      return findIn(client, userId, id);
    });
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
    if (page.after !== null) conditions.push(afterPosition(page.after));

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
             coalesce(
               (SELECT array_agg(g.name)
                  FROM transaction_tags tt
                  JOIN tags g ON g.id = tt.tag_id
                 WHERE tt.transaction_id = transactions.id),
               '{}'
             ) AS tags,
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
interface RawRow extends Omit<Row, 'date' | 'amount' | 'tags'> {
  date: string;
  amount: string;
  tags: string[];
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
  if (filter.search !== undefined) {
    conditions.push(
      containsText([Prisma.sql`description`, Prisma.sql`coalesce(merchant, '')`], filter.search),
    );
  }
  if (filter.tagKey !== undefined) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
       WHERE tt.transaction_id = transactions.id AND g.name_key = ${filter.tagKey})`);
  }

  return conditions;
}

function fromRawRow({ date, amount, currency, tags, ...fields }: RawRow): Transaction {
  return {
    ...fields,
    date: LocalDate.parse(date),
    amount: Money.of(amount, currency),
    tags: orderTags(tags),
  };
}

function toTransaction({ amount, currency, date, tags, ...fields }: Row): Transaction {
  return {
    ...fields,
    tags: orderTags(tags.map(({ tag }) => tag.name)),
    date: fromDatabaseDate(date),
    // NUMERIC(18,2) ya trae dos decimales: el texto entra a `Money` sin redondear nada.
    amount: Money.of(amount.toFixed(2), currency),
  };
}
