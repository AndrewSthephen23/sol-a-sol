import { type Currency, toCurrency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import type { Money } from '../money/money.js';
import { parseAmount } from '../money/parse-amount.js';
import type { CsvRow } from '../text/csv.js';
import { searchKey } from '../text/search-key.js';
import { LocalDate } from '../time/local-date.js';
import { type NormalizedTag, normalizeTags } from './tag-policy.js';
import {
  assertTransactionAmount,
  assertTransactionDate,
  type TransactionType,
} from './transaction-policy.js';
import { NonPositiveTransferAmountError } from './transfer-policy.js';

/**
 * Cómo se lee cada fila del **formato oficial de importación** (tarea 07b; ver
 * `docs/modules/transactions-import-format.md`). Aquí se interpreta cada celda con las reglas del
 * dominio; qué categoría, método o etiqueta existe en la cuenta lo resuelve la API.
 */

/** Columnas del formato oficial, en el orden de la plantilla. */
export const IMPORT_COLUMNS = [
  'fecha',
  'tipo',
  'categoria',
  'subcategoria',
  'monto',
  'moneda',
  'descripcion',
  'metodo_pago',
  'comercio',
  'destino',
  'monto_destino',
  'etiquetas',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Sin estas, el archivo se rechaza entero, antes de leer las filas. */
const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'fecha',
  'tipo',
  'monto',
  'moneda',
  'descripcion',
];

/** Los tipos como se escriben en el CSV, por su clave (`searchKey`). */
const TYPES_BY_LABEL = new Map<string, TransactionType | 'TRANSFER'>([
  ['ingreso', 'INCOME'],
  ['gasto fijo', 'FIXED_EXPENSE'],
  ['gasto variable', 'VARIABLE_EXPENSE'],
  ['ahorro', 'SAVING'],
  ['inversion', 'INVESTMENT'],
  ['deuda', 'DEBT'],
  ['transferencia', 'TRANSFER'],
]);

const TAG_SEPARATOR = '|';

export class MissingImportColumnsError extends DomainError {
  readonly code = 'IMPORT_COLUMNS_MISSING';

  constructor(missing: readonly string[]) {
    super(`The file lacks the required columns: ${missing.join(', ')}.`);
  }
}

class UnknownImportTypeError extends DomainError {
  readonly code = 'IMPORT_TYPE_UNKNOWN';

  constructor() {
    super(
      'Unknown type: use Ingreso, Gasto fijo, Gasto variable, Ahorro, Inversión, Deuda or Transferencia.',
    );
  }
}

class ImportCurrencyMismatchError extends DomainError {
  readonly code = 'IMPORT_CURRENCY_MISMATCH';

  constructor() {
    super('The currency symbol of the amount is not the one of the currency column.');
  }
}

class ImportFieldRequiredError extends DomainError {
  readonly code = 'IMPORT_FIELD_REQUIRED';

  constructor() {
    super('This column is required in this row.');
  }
}

class ImportFieldNotAllowedError extends DomainError {
  readonly code = 'IMPORT_FIELD_NOT_ALLOWED';

  constructor(kind: 'transaction' | 'transfer') {
    super(`This column must be empty in a ${kind}.`);
  }
}

/** Dónde está cada columna del formato en este archivo, y cuáles se ignoran. */
export interface ImportLayout {
  columns: ReadonlyMap<ImportColumn, number>;
  /** Columnas que no son del formato ("Mes", "Presupuesto"), tal como vinieron. */
  ignored: string[];
}

/** "Método de pago", "METODO_PAGO" y "metodo pago" son la misma columna. */
function columnKey(name: string): string {
  return searchKey(name).replaceAll(/[\s_-]+/gu, ' ');
}

/** Cada columna por su clave, más cómo se suele escribir en una hoja en español. */
const COLUMNS_BY_KEY = new Map<string, ImportColumn>([
  ...IMPORT_COLUMNS.map((column): [string, ImportColumn] => [columnKey(column), column]),
  ['metodo de pago', 'metodo_pago'],
  ['monto de destino', 'monto_destino'],
]);

export function importLayout(header: readonly string[]): ImportLayout {
  const columns = new Map<ImportColumn, number>();
  const ignored: string[] = [];
  header.forEach((name, index) => {
    const column = COLUMNS_BY_KEY.get(columnKey(name));
    if (column === undefined) {
      ignored.push(name);
    } else if (!columns.has(column)) {
      columns.set(column, index);
    }
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) throw new MissingImportColumnsError(missing);

  return { columns, ignored };
}

interface CommonFields {
  /** Línea del archivo, para los mensajes. */
  line: number;
  date: LocalDate;
  amount: Money;
  description: string;
}

export interface ImportedTransaction extends CommonFields {
  kind: 'transaction';
  type: TransactionType;
  /** Por nombre: la API la busca en la cuenta. */
  category: string;
  subcategory: string | null;
  paymentMethod: string | null;
  merchant: string | null;
  tags: NormalizedTag[];
}

export interface ImportedTransfer extends CommonFields {
  kind: 'transfer';
  /** Alias de las cuentas: la API las busca en la cuenta. */
  from: string;
  to: string;
  /** Lo que llegó, como texto decimal; `null` si no se indicó. */
  receivedAmount: string | null;
}

export type ImportedRow = ImportedTransaction | ImportedTransfer;

/** Un problema de una fila, en una columna. */
export interface RowProblem {
  line: number;
  field: ImportColumn;
  code: string;
  message: string;
}

export type RowInterpretation = { row: ImportedRow } | { problems: RowProblem[] };

/**
 * Lee una fila con las reglas del dominio: fecha ISO y no futura, tipo del formato, moneda
 * `PEN`/`USD`, monto con `parseAmount` (punto decimal, positivo, su símbolo igual a la moneda),
 * etiquetas separadas por `|`. Una transferencia no lleva categoría, comercio ni etiquetas, y sí
 * origen y destino. Devuelve la fila o **todos** sus problemas, por columna.
 */
export function interpretImportRow(
  row: CsvRow,
  layout: ImportLayout,
  today: LocalDate,
): RowInterpretation {
  const problems: RowProblem[] = [];
  const cell = (column: ImportColumn): string | null => {
    const index = layout.columns.get(column);
    const value = index === undefined ? '' : (row.cells[index] ?? '').trim();

    return value === '' ? null : value;
  };
  const read = <T>(column: ImportColumn, parse: () => T): T | undefined => {
    try {
      return parse();
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      problems.push({ line: row.line, field: column, code: error.code, message: error.message });

      return undefined;
    }
  };
  // Una celda obligatoria vacía dice que falta, antes que decir que su formato es malo.
  const filled = (column: ImportColumn): string =>
    cell(column) ?? raise(new ImportFieldRequiredError());
  const required = (column: ImportColumn): string | undefined => read(column, () => filled(column));

  const date = read('fecha', () => {
    const parsed = LocalDate.parse(filled('fecha'));
    assertTransactionDate(parsed, today);

    return parsed;
  });
  const type = read('tipo', () => typeOf(filled('tipo')));
  const currency = read('moneda', () => toCurrency(filled('moneda').toUpperCase()));
  const amount =
    currency === undefined
      ? undefined
      : read('monto', () => amountOf(filled('monto'), currency, type));
  const description = required('descripcion');

  const kind = type === 'TRANSFER' ? 'transfer' : 'transaction';
  const forbid = (...columns: ImportColumn[]): void => {
    for (const column of columns) {
      if (cell(column) !== null) read(column, () => raise(new ImportFieldNotAllowedError(kind)));
    }
  };

  if (type === 'TRANSFER') {
    forbid('categoria', 'subcategoria', 'comercio', 'etiquetas');
    const from = required('metodo_pago');
    const to = required('destino');
    const received = cell('monto_destino');
    const receivedAmount =
      received === null || currency === undefined
        ? null
        : read('monto_destino', () =>
            parseAmount(received, { defaultCurrency: currency }).toFixed(),
          );
    if (
      problems.length > 0 ||
      date === undefined ||
      amount === undefined ||
      description === undefined ||
      from === undefined ||
      to === undefined ||
      receivedAmount === undefined
    ) {
      return { problems };
    }

    return {
      row: {
        kind: 'transfer',
        line: row.line,
        date,
        amount,
        description,
        from,
        to,
        receivedAmount,
      },
    };
  }

  forbid('destino', 'monto_destino');
  const category = required('categoria');
  const tags = read('etiquetas', () => normalizeTags(splitTags(cell('etiquetas'))));
  if (
    problems.length > 0 ||
    date === undefined ||
    type === undefined ||
    amount === undefined ||
    description === undefined ||
    category === undefined ||
    tags === undefined
  ) {
    return { problems };
  }

  return {
    row: {
      kind: 'transaction',
      line: row.line,
      date,
      type,
      category,
      subcategory: cell('subcategoria'),
      amount,
      description,
      paymentMethod: cell('metodo_pago'),
      merchant: cell('comercio'),
      tags,
    },
  };
}

function typeOf(label: string): TransactionType | 'TRANSFER' {
  const type = TYPES_BY_LABEL.get(searchKey(label));
  if (type === undefined) throw new UnknownImportTypeError();

  return type;
}

/** El monto con la moneda de su columna; un símbolo de otra moneda es un dato contradictorio. */
function amountOf(
  text: string,
  currency: Currency,
  type: TransactionType | 'TRANSFER' | undefined,
): Money {
  const amount = parseAmount(text, { defaultCurrency: currency });
  if (amount.currency !== currency) throw new ImportCurrencyMismatchError();
  if (type === 'TRANSFER') {
    if (!amount.isPositive()) throw new NonPositiveTransferAmountError();
  } else {
    assertTransactionAmount(amount);
  }

  return amount;
}

/** `almuerzo|oficina` → dos etiquetas. Una vacía entre separadores la rechaza `normalizeTags`. */
function splitTags(text: string | null): string[] {
  return text === null ? [] : text.split(TAG_SEPARATOR);
}

function raise(error: DomainError): never {
  throw error;
}

/**
 * La huella de cada fila, para no importar dos veces lo mismo: fecha, tipo, monto, moneda,
 * descripción y comercio (en una transferencia, sus cuentas), sin mayúsculas ni tildes. Termina
 * en `#n`, el número de aparición de esa misma fila en el archivo: dos pasajes iguales el mismo
 * día son dos filas, y reimportar el archivo reconoce las dos.
 */
export function importFingerprints(rows: readonly ImportedRow[]): string[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const base = JSON.stringify(
      row.kind === 'transaction'
        ? [
            row.kind,
            row.date.toString(),
            row.type,
            row.amount.toFixed(),
            row.amount.currency,
            searchKey(row.description),
            searchKey(row.merchant ?? ''),
          ]
        : [
            row.kind,
            row.date.toString(),
            row.amount.toFixed(),
            row.amount.currency,
            searchKey(row.description),
            searchKey(row.from),
            searchKey(row.to),
          ],
    );
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);

    return `${base}#${String(occurrence)}`;
  });
}
