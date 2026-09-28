import { Inject, Injectable } from '@nestjs/common';
import { type Clock, type ImportedRow, type RowProblem, searchKey, today } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import {
  AccountNames,
  importKeyOf,
  lengthProblems,
  readImportFile,
  Tally,
  type UnresolvedCategory,
  type UnresolvedPaymentMethod,
} from './import-file.js';
import { TAG_REPOSITORY, type TagRepository } from '../ports/tag-repository.js';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import { TRANSFER_REPOSITORY, type TransferRepository } from '../ports/transfer-repository.js';

export { importKeyOf, readImportFile } from './import-file.js';
export type { UnresolvedCategory, UnresolvedPaymentMethod } from './import-file.js';

/** Lo que pasaría al importar el archivo, sin haber guardado nada. */
export interface ImportPreview {
  /** Filas de datos leídas (sin la cabecera ni las vacías). */
  rows: number;
  /** Transacciones y transferencias que entrarían, una vez resuelto lo pendiente. */
  transactions: number;
  transfers: number;
  /** Líneas que ya se importaron antes: se omiten. */
  alreadyImported: number[];
  /** Cada problema, con su línea y su columna. Una fila con problemas no entra. */
  problems: RowProblem[];
  /** Columnas que no son del formato ("Mes", "Presupuesto"). */
  ignoredColumns: string[];
  categories: UnresolvedCategory[];
  paymentMethods: UnresolvedPaymentMethod[];
  /** Etiquetas que se crearían, con su primera escritura. */
  newTags: string[];
}

/**
 * Lee un CSV del formato oficial y dice **qué pasaría** al importarlo, sin guardar nada
 * (tarea 07b). La confirmación vuelve a leerlo, con las decisiones sobre lo que falta.
 */
@Injectable()
export class PreviewImport {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, csv }: { userId: string; csv: string }): Promise<ImportPreview> {
    const file = readImportFile(csv, today(this.clock));
    const keys = file.rows.map((row) => importKeyOf(row.fingerprint));
    const imported = new Set([
      ...(await this.transactions.importedKeys(userId, keys)),
      ...(await this.transfers.importedKeys(userId, keys)),
    ]);
    const pending = file.rows.filter((_, index) => !imported.has(keys[index] ?? ''));

    const resolution = new AccountNames(
      await this.catalog.allCategories(userId),
      await this.catalog.allPaymentMethods(userId),
    );
    const problems = [...file.problems];
    const categories = new Tally<UnresolvedCategory>();
    const methods = new Tally<UnresolvedPaymentMethod>();
    const importable: ImportedRow[] = [];
    for (const { row } of pending) {
      const rowProblems = lengthProblems(row);
      if (row.kind === 'transaction') {
        const category = resolution.category(row);
        if (category !== null) categories.add(category.key, row.line, category.entry);
        if (row.paymentMethod !== null) {
          const method = resolution.paymentMethod(row.paymentMethod);
          if (method !== null) methods.add(method.key, row.line, method.entry);
        }
      } else {
        rowProblems.push(...resolution.transferProblems(row, methods));
      }
      problems.push(...rowProblems);
      if (rowProblems.length === 0) importable.push(row);
    }

    return {
      rows: file.total,
      transactions: importable.filter((row) => row.kind === 'transaction').length,
      transfers: importable.filter((row) => row.kind === 'transfer').length,
      alreadyImported: file.rows
        .filter((_, index) => imported.has(keys[index] ?? ''))
        .map(({ row }) => row.line),
      problems: problems.toSorted((a, b) => a.line - b.line),
      ignoredColumns: file.ignored,
      categories: categories.values(),
      paymentMethods: methods.values(),
      newTags: await this.newTags(userId, importable),
    };
  }

  /** Las etiquetas del archivo que la cuenta no tiene, sin repetir, con su primera escritura. */
  private async newTags(userId: string, rows: readonly ImportedRow[]): Promise<string[]> {
    const existing = new Set((await this.tags.list(userId)).map((tag) => searchKey(tag.name)));
    const fresh = new Map<string, string>();
    for (const row of rows) {
      if (row.kind !== 'transaction') continue;
      for (const tag of row.tags) {
        if (!existing.has(tag.key) && !fresh.has(tag.key)) fresh.set(tag.key, tag.name);
      }
    }

    return [...fresh.values()];
  }
}
