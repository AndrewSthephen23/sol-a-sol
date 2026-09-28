import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ImportConflictError } from '../domain/errors.js';
import type { ImportWriter } from '../ports/import-writer.js';
import type { NewTransaction } from '../ports/transaction-repository.js';
import type { NewTransfer } from '../ports/transfer-repository.js';
import { toDatabaseDate } from './database-date.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Filas por consulta. PostgreSQL admite 65 535 parámetros por consulta: 5 000 transacciones de
 * 12 columnas no caben en una sola.
 */
const BATCH_SIZE = 500;

/** Una importación de 5 000 filas tarda más que el tope por defecto de una transacción (5 s). */
const TRANSACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class PrismaImportWriter implements ImportWriter {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    userId: string,
    rows: { transactions: readonly NewTransaction[]; transfers: readonly NewTransfer[] },
  ): Promise<{ transactionIds: string[]; transferIds: string[] }> {
    try {
      return await this.prisma.$transaction(
        async (client) => {
          const transactionIds = await this.writeTransactions(client, userId, rows.transactions);
          const transferIds: string[] = [];
          for (const batch of batches(rows.transfers)) {
            const created = await client.transfer.createManyAndReturn({
              data: batch.map((transfer) => transferData(transfer)),
              select: { id: true, importKey: true },
            });
            transferIds.push(...inOrder(batch, created));
          }

          return { transactionIds, transferIds };
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      // El índice único `(user_id, import_key)` decide: otra importación se cruzó con esta, y
      // la base deshizo todo.
      if (isUniqueViolation(error)) throw new ImportConflictError();
      throw error;
    }
  }

  private async writeTransactions(
    client: Client,
    userId: string,
    transactions: readonly NewTransaction[],
  ): Promise<string[]> {
    const tagIds = await this.tagIds(client, userId, transactions);
    const ids: string[] = [];
    for (const batch of batches(transactions)) {
      const created = await client.transaction.createManyAndReturn({
        data: batch.map((transaction) => transactionData(transaction)),
        select: { id: true, importKey: true },
      });
      const batchIds = inOrder(batch, created);
      const links = batch.flatMap((transaction, index) =>
        transaction.tags.map((tag) => ({
          transactionId: batchIds[index] ?? '',
          tagId: tagIds.get(tag.key) ?? '',
          userId,
        })),
      );
      if (links.length > 0) await client.transactionTag.createMany({ data: links });
      ids.push(...batchIds);
    }

    return ids;
  }

  /**
   * Crea las etiquetas que la cuenta no tiene y devuelve el id de cada una por su clave.
   * `skipDuplicates` deja que el índice único decida, como al registrar a mano.
   */
  private async tagIds(
    client: Client,
    userId: string,
    transactions: readonly NewTransaction[],
  ): Promise<Map<string, string>> {
    const tags = new Map(
      transactions.flatMap((transaction) => transaction.tags).map((tag) => [tag.key, tag.name]),
    );
    if (tags.size === 0) return new Map();

    await client.tag.createMany({
      data: [...tags].map(([nameKey, name]) => ({ userId, name, nameKey })),
      skipDuplicates: true,
    });
    const rows = await client.tag.findMany({
      where: { userId, nameKey: { in: [...tags.keys()] } },
      select: { id: true, nameKey: true },
    });

    return new Map(rows.map((row) => [row.nameKey, row.id]));
  }
}

type Client = Pick<PrismaService, 'transaction' | 'transfer' | 'tag' | 'transactionTag'>;

function* batches<T>(rows: readonly T[]): Generator<readonly T[]> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    yield rows.slice(start, start + BATCH_SIZE);
  }
}

/** Los ids en el orden de las filas: cada huella es única, así que las empareja sin ambigüedad. */
function inOrder(
  rows: readonly { importKey?: string }[],
  created: readonly { id: string; importKey: string | null }[],
): string[] {
  const byKey = new Map(created.map((row) => [row.importKey, row.id]));

  return rows.map((row) => byKey.get(row.importKey ?? null) ?? '');
}

function transactionData(transaction: NewTransaction) {
  return {
    userId: transaction.userId,
    date: toDatabaseDate(transaction.date),
    type: transaction.type,
    categoryId: transaction.categoryId,
    // Como texto: pasar por `number` perdería céntimos antes de llegar a NUMERIC(18,2).
    amount: transaction.amount.toFixed(),
    currency: transaction.amount.currency,
    description: transaction.description,
    paymentMethodId: transaction.paymentMethodId,
    merchant: transaction.merchant,
    source: transaction.source,
    importKey: transaction.importKey ?? null,
  };
}

function transferData({ amount, receivedAmount, date, ...fields }: NewTransfer) {
  return {
    ...fields,
    date: toDatabaseDate(date),
    amount: amount.toFixed(),
    currency: amount.currency,
    receivedAmount: receivedAmount.toFixed(),
    receivedCurrency: receivedAmount.currency,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
