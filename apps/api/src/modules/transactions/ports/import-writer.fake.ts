import { ImportConflictError } from '../domain/errors.js';
import type { ImportWriter } from './import-writer.js';
import type { FakeTransactionRepository } from './transaction-repository.fake.js';
import type { FakeTransferRepository } from './transfer-repository.fake.js';
import type { NewTransaction } from './transaction-repository.js';
import type { NewTransfer } from './transfer-repository.js';

/** Escribe en los mismos repositorios en memoria, todo o nada, como la base. */
export class FakeImportWriter implements ImportWriter {
  constructor(
    private readonly transactions: FakeTransactionRepository,
    private readonly transfers: FakeTransferRepository,
  ) {}

  async write(
    userId: string,
    rows: { transactions: readonly NewTransaction[]; transfers: readonly NewTransfer[] },
  ): Promise<{ transactionIds: string[]; transferIds: string[] }> {
    const keys = [...rows.transactions, ...rows.transfers].map((row) => row.importKey ?? '');
    const taken = [
      ...(await this.transactions.importedKeys(userId, keys)),
      ...(await this.transfers.importedKeys(userId, keys)),
    ];
    if (taken.length > 0 || new Set(keys).size !== keys.length) throw new ImportConflictError();

    const transactionIds: string[] = [];
    for (const transaction of rows.transactions) {
      transactionIds.push((await this.transactions.create(transaction)).id);
    }
    const transferIds: string[] = [];
    for (const transfer of rows.transfers) {
      transferIds.push((await this.transfers.create(transfer)).id);
    }

    return { transactionIds, transferIds };
  }
}
