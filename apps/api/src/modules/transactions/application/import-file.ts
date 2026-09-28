import { createHash } from 'node:crypto';

import {
  CATEGORY_NAME_MAX_LENGTH,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  MERCHANT_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
} from '@sol-a-sol/contracts';
import {
  DomainError,
  type ImportColumn,
  type ImportedRow,
  type ImportedTransaction,
  type ImportedTransfer,
  importFingerprints,
  importLayout,
  interpretImportRow,
  type LocalDate,
  readCsv,
  resolveTransferAmounts,
  type RowProblem,
  searchKey,
  type TransactionType,
} from '@sol-a-sol/domain';

import { ImportFileTooLargeError, ImportTooManyRowsError } from '../domain/errors.js';
import type { CatalogCategory, CatalogPaymentMethod } from '../ports/catalog-reader.js';

/**
 * Lo que comparten la vista previa y la confirmación de la importación (tarea 07b): leer el
 * archivo, sus huellas y buscar por nombre en la cuenta. Las dos usan estas mismas funciones, así
 * que leen, numeran y resuelven igual.
 */

/** Algo del archivo que no existe en la cuenta, o existe archivado, y hay que resolver. */
export type Unresolved = 'missing' | 'archived';

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

/** La huella que se guarda: el SHA-256 de la del dominio, de largo fijo. */
export function importKeyOf(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex');
}

export interface ReadFile {
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
export function readImportFile(csv: string, day: LocalDate): ReadFile {
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
export function lengthProblems(row: ImportedRow): RowProblem[] {
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
export class Tally<T extends { lines: number[] }> {
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
export class AccountNames {
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
    const key = categoryKey(row);
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

  /** La categoría de primer nivel con ese tipo y nombre, archivada o no. */
  topLevelCategory(type: TransactionType, name: string): CatalogCategory | undefined {
    return this.topLevel.get(`${type}/${searchKey(name)}`);
  }

  /** La subcategoría de esa madre con ese nombre, archivada o no. */
  childCategory(parentId: string, name: string): CatalogCategory | undefined {
    return this.children.get(`${parentId}/${searchKey(name)}`);
  }

  /** El método con ese alias, archivado o no. */
  method(alias: string): CatalogPaymentMethod | undefined {
    return this.methods.get(searchKey(alias));
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

export function problem(
  row: ImportedRow,
  field: ImportColumn,
  code: string,
  message: string,
): RowProblem {
  return { line: row.line, field, code, message };
}

/** Cómo se identifica una categoría del archivo, en la vista previa y en las decisiones. */
export function categoryKey(target: {
  type: TransactionType;
  category: string;
  subcategory: string | null;
}): string {
  return [target.type, searchKey(target.category), searchKey(target.subcategory ?? '')].join('/');
}
