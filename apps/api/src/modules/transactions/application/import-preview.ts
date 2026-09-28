import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_NAME_MAX_LENGTH,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  MERCHANT_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
} from '@sol-a-sol/contracts';
import {
  type Clock,
  DomainError,
  type ImportColumn,
  type ImportedRow,
  type ImportedTransaction,
  type ImportedTransfer,
  importFingerprints,
  importLayout,
  interpretImportRow,
  readCsv,
  resolveTransferAmounts,
  type RowProblem,
  searchKey,
  today,
  type TransactionType,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { ImportFileTooLargeError, ImportTooManyRowsError } from '../domain/errors.js';
import {
  CATALOG_READER,
  type CatalogCategory,
  type CatalogPaymentMethod,
  type CatalogReader,
} from '../ports/catalog-reader.js';
import { TAG_REPOSITORY, type TagRepository } from '../ports/tag-repository.js';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import { TRANSFER_REPOSITORY, type TransferRepository } from '../ports/transfer-repository.js';

/** Algo del archivo que no existe en la cuenta, o existe archivado, y hay que resolver. */
type Unresolved = 'missing' | 'archived';

export interface UnresolvedCategory {
  type: TransactionType;
  category: string;
  subcategory: string | null;
  status: Unresolved;
  /** Líneas del archivo que la usan. */
  lines: number[];
}

export interface UnresolvedPaymentMethod {
  alias: string;
  status: Unresolved;
  lines: number[];
}

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

/** La huella que se guarda: el SHA-256 de la del dominio, de largo fijo. */
export function importKeyOf(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex');
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

interface ReadFile {
  total: number;
  ignored: string[];
  problems: RowProblem[];
  /** Las filas que el dominio pudo leer, con su huella. */
  rows: { row: ImportedRow; fingerprint: string }[];
}

/**
 * Límites, lectura e interpretación de cada fila con el dominio. Las huellas se numeran sobre
 * **todas** las filas legibles, en el orden del archivo: la confirmación las numera igual.
 */
export function readImportFile(csv: string, day: ReturnType<typeof today>): ReadFile {
  if (Buffer.byteLength(csv, 'utf8') > IMPORT_MAX_BYTES) throw new ImportFileTooLargeError();
  const file = readCsv(csv);
  if (file.rows.length > IMPORT_MAX_ROWS) throw new ImportTooManyRowsError();
  const layout = importLayout(file.header);

  const problems: RowProblem[] = [];
  const rows: ImportedRow[] = [];
  for (const row of file.rows) {
    const result = interpretImportRow(row, layout, day);
    if ('row' in result) rows.push(result.row);
    else problems.push(...result.problems);
  }
  const fingerprints = importFingerprints(rows);

  return {
    total: file.rows.length,
    ignored: layout.ignored,
    problems,
    rows: rows.map((row, index) => ({ row, fingerprint: fingerprints[index] ?? '' })),
  };
}

/** Lo que la API sabe y el dominio no: los largos máximos de lo que se guarda. */
function lengthProblems(row: ImportedRow): RowProblem[] {
  const checks: [ImportColumn, string | null, number][] = [
    ['descripcion', row.description, TRANSACTION_DESCRIPTION_MAX_LENGTH],
  ];
  if (row.kind === 'transaction') {
    checks.push(
      ['comercio', row.merchant, MERCHANT_MAX_LENGTH],
      ['categoria', row.category, CATEGORY_NAME_MAX_LENGTH],
      ['subcategoria', row.subcategory, CATEGORY_NAME_MAX_LENGTH],
      ...row.tags.map((tag): [ImportColumn, string, number] => [
        'etiquetas',
        tag.name,
        TAG_NAME_MAX_LENGTH,
      ]),
    );
  }

  return checks
    .filter(([, value, max]) => value !== null && value.length > max)
    .map(([field, , max]) => ({
      line: row.line,
      field,
      code: 'IMPORT_FIELD_TOO_LONG',
      message: `This value is longer than ${String(max)} characters.`,
    }));
}

/** Cuenta cuántas líneas usan cada cosa por resolver, en el orden en que aparecen. */
class Tally<T extends { lines: number[] }> {
  private readonly entries = new Map<string, T>();

  add(key: string, line: number, entry: Omit<T, 'lines'>): void {
    const found = this.entries.get(key);
    if (found === undefined) this.entries.set(key, { ...entry, lines: [line] } as T);
    else found.lines.push(line);
  }

  values(): T[] {
    return [...this.entries.values()];
  }
}

/** Busca las categorías y los métodos del archivo por nombre, sin mayúsculas ni tildes. */
class AccountNames {
  private readonly topLevel = new Map<string, CatalogCategory>();
  private readonly children = new Map<string, CatalogCategory>();
  private readonly methods = new Map<string, CatalogPaymentMethod>();

  constructor(categories: readonly CatalogCategory[], methods: readonly CatalogPaymentMethod[]) {
    for (const category of categories) {
      if (category.parentId === null) {
        this.topLevel.set(`${category.type}/${searchKey(category.name)}`, category);
      } else {
        this.children.set(`${category.parentId}/${searchKey(category.name)}`, category);
      }
    }
    for (const method of methods) this.methods.set(searchKey(method.alias), method);
  }

  /** `null` si la categoría (y la subcategoría, si hay) existe y está activa. */
  category(
    row: ImportedTransaction,
  ): { key: string; entry: Omit<UnresolvedCategory, 'lines'> } | null {
    const key = [row.type, searchKey(row.category), searchKey(row.subcategory ?? '')].join('/');
    const unresolved = (status: Unresolved) => ({
      key,
      entry: {
        type: row.type,
        category: row.category,
        subcategory: row.subcategory,
        status,
      },
    });
    const parent = this.topLevel.get(`${row.type}/${searchKey(row.category)}`);
    if (parent === undefined) return unresolved('missing');
    if (parent.archived) return unresolved('archived');
    if (row.subcategory === null) return null;
    const child = this.children.get(`${parent.id}/${searchKey(row.subcategory)}`);
    if (child === undefined) return unresolved('missing');

    return child.archived ? unresolved('archived') : null;
  }

  /** `null` si el alias existe y está activo. */
  paymentMethod(
    alias: string,
  ): { key: string; entry: Omit<UnresolvedPaymentMethod, 'lines'> } | null {
    const method = this.methods.get(searchKey(alias));
    if (method !== undefined && !method.archived) return null;

    return {
      key: searchKey(alias),
      entry: { alias, status: method === undefined ? 'missing' : 'archived' },
    };
  }

  /**
   * Las dos cuentas de una transferencia: las que faltan se anotan para resolver; si las dos
   * existen y están activas, se juzgan sus monedas y montos como en una transferencia manual.
   */
  transferProblems(row: ImportedTransfer, pending: Tally<UnresolvedPaymentMethod>): RowProblem[] {
    if (searchKey(row.from) === searchKey(row.to)) {
      return [
        problem(
          row,
          'destino',
          'TRANSFER_SAME_ACCOUNT',
          'Origin and destination are the same account.',
        ),
      ];
    }
    const sides = [row.from, row.to].map((alias) => {
      const unresolved = this.paymentMethod(alias);
      if (unresolved !== null) pending.add(unresolved.key, row.line, unresolved.entry);

      return unresolved === null ? this.methods.get(searchKey(alias)) : undefined;
    });
    const [from, to] = sides;
    if (from === undefined || to === undefined) return [];

    try {
      resolveTransferAmounts(
        {
          amount: row.amount.toFixed(),
          currency: row.amount.currency,
          receivedAmount: row.receivedAmount,
          receivedCurrency: null,
        },
        from,
        to,
      );

      return [];
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const field: ImportColumn =
        error.code === 'TRANSFER_CURRENCY_MISMATCH' ? 'moneda' : 'monto_destino';

      return [problem(row, field, error.code, error.message)];
    }
  }
}

function problem(row: ImportedRow, field: ImportColumn, code: string, message: string): RowProblem {
  return { line: row.line, field, code, message };
}
