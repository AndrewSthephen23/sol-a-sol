import { describe, expect, it } from 'vitest';

import { readCsv } from '../text/csv.js';
import { LocalDate } from '../time/local-date.js';
import {
  type ImportedRow,
  importFingerprints,
  importLayout,
  interpretImportRow,
  MissingImportColumnsError,
  type RowInterpretation,
} from './import-row.js';

const TODAY = LocalDate.of(2026, 9, 28);
const HEADER =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';

/** Interpreta la única fila de un CSV con la cabecera oficial. */
function interpret(line: string, header = HEADER): RowInterpretation {
  const csv = readCsv(`${header}\n${line}`);
  const [row] = csv.rows;
  if (row === undefined) throw new Error('No row');

  return interpretImportRow(row, importLayout(csv.header), TODAY);
}

function rowOf(line: string): ImportedRow {
  const result = interpret(line);
  if (!('row' in result)) throw new Error(JSON.stringify(result.problems));

  return result.row;
}

function codesOf(line: string): [string, string][] {
  const result = interpret(line);
  if ('row' in result) throw new Error('Expected problems');

  return result.problems.map((problem) => [problem.field, problem.code]);
}

describe('importLayout', () => {
  it('finds each column by its name, in any order, ignoring case, accents and spaces', () => {
    const layout = importLayout([
      'Descripción',
      'MONTO',
      'Método de pago',
      'Fecha',
      'Tipo',
      'moneda',
    ]);

    expect(layout.columns.get('descripcion')).toBe(0);
    expect(layout.columns.get('metodo_pago')).toBe(2);
    expect(layout.ignored).toEqual([]);
  });

  it.each([
    ['Método   de   pago', 'metodo_pago'],
    ['metodo-pago', 'metodo_pago'],
    ['Monto de destino', 'monto_destino'],
    ['MONTO_DESTINO', 'monto_destino'],
  ])('reads the header %j as the column %s', (name, column) => {
    const layout = importLayout(['fecha', 'tipo', 'monto', 'moneda', 'descripcion', name]);

    expect(layout.columns.get(column as never)).toBe(5);
  });

  it('takes the first of two columns with the same name', () => {
    const layout = importLayout(['fecha', 'tipo', 'monto', 'moneda', 'descripcion', 'Monto']);

    expect(layout.columns.get('monto')).toBe(2);
  });

  // Un "Mes" o un "Presupuesto" de la hoja se ignoran; la vista previa los avisa.
  it('lists the columns it ignores', () => {
    expect(importLayout(HEADER.split(',').concat(['Mes', 'Presupuesto'])).ignored).toEqual([
      'Mes',
      'Presupuesto',
    ]);
  });

  it('rejects a file without a required column, naming the missing ones', () => {
    expect(() => importLayout(['fecha', 'tipo', 'monto'])).toThrow(MissingImportColumnsError);
    expect(() => importLayout(['fecha', 'tipo', 'monto'])).toThrow(/moneda, descripcion/);
  });
});

describe('interpretImportRow', () => {
  describe('a transaction', () => {
    it('reads every column', () => {
      const row = rowOf(
        '2026-09-03,Gasto variable,Comida,Delivery,32.50,PEN,Pizza,Visa Interbank,Rappi,,,cena|con amigos',
      );

      expect(row).toMatchObject({
        kind: 'transaction',
        line: 2,
        type: 'VARIABLE_EXPENSE',
        category: 'Comida',
        subcategory: 'Delivery',
        description: 'Pizza',
        paymentMethod: 'Visa Interbank',
        merchant: 'Rappi',
        tags: [
          { name: 'cena', key: 'cena' },
          { name: 'con amigos', key: 'con amigos' },
        ],
      });
      if (row.kind !== 'transaction') throw new Error('Expected a transaction');
      expect(row.date.toString()).toBe('2026-09-03');
      expect(`${row.amount.toFixed()} ${row.amount.currency}`).toBe('32.50 PEN');
    });

    it('leaves the optional columns empty as null', () => {
      expect(rowOf('2026-09-03,Ingreso,Sueldo,,4500.00,PEN,Beca,,,,,')).toMatchObject({
        subcategory: null,
        paymentMethod: null,
        merchant: null,
        tags: [],
      });
    });

    it('trims every value', () => {
      expect(rowOf('2026-09-03, Gasto variable , Comida ,,25.90, pen , Pizza ,,,,,')).toMatchObject(
        {
          type: 'VARIABLE_EXPENSE',
          category: 'Comida',
          description: 'Pizza',
        },
      );
    });

    it.each([
      ['Ingreso', 'INCOME'],
      ['GASTO FIJO', 'FIXED_EXPENSE'],
      ['gasto variable', 'VARIABLE_EXPENSE'],
      ['Ahorro', 'SAVING'],
      ['Inversion', 'INVESTMENT'],
      ['Inversión', 'INVESTMENT'],
      ['Deuda', 'DEBT'],
    ])('reads the type %j as %s', (label, type) => {
      expect(rowOf(`2026-09-03,${label},X,,1.00,PEN,Algo,,,,,`)).toMatchObject({ type });
    });

    it.each(['1,234.50', 'S/ 1,234.50', '1234.5'])('reads the amount %j', (amount) => {
      const row = rowOf(`2026-09-03,Ingreso,X,,"${amount}",PEN,Algo,,,,,`);

      expect(row.amount.currency).toBe('PEN');
      expect(row.amount.toFixed()).toBe(amount === '1234.5' ? '1234.50' : '1234.50');
    });

    it('lets each row carry its own currency', () => {
      expect(rowOf('2026-09-10,Gasto variable,X,,US$ 15.99,USD,Netflix,,,,,').amount.currency).toBe(
        'USD',
      );
    });
  });

  describe('a transfer', () => {
    it('reads the origin, the destination and the amount received', () => {
      const row = rowOf(
        '2026-09-10,Transferencia,,,37.50,PEN,Cambio,Interbank Simple Soles,,Interbank Simple Dólares,10.00,',
      );

      expect(row).toMatchObject({
        kind: 'transfer',
        from: 'Interbank Simple Soles',
        to: 'Interbank Simple Dólares',
        receivedAmount: '10.00',
        description: 'Cambio',
      });
    });

    it('leaves the amount received empty as null', () => {
      expect(rowOf('2026-09-04,Transferencia,,,50.00,PEN,A Yape,BCP,,Yape,,')).toMatchObject({
        receivedAmount: null,
      });
    });
  });

  describe('reports every problem of a row, by column', () => {
    it.each([
      [
        'a date that does not exist',
        '2026-02-30,Ingreso,X,,1.00,PEN,A,,,,,',
        'fecha',
        'INVALID_LOCAL_DATE',
      ],
      [
        'a date written the Peruvian way',
        '03/04/2026,Ingreso,X,,1.00,PEN,A,,,,,',
        'fecha',
        'INVALID_LOCAL_DATE',
      ],
      [
        'a date in the future',
        '2026-09-29,Ingreso,X,,1.00,PEN,A,,,,,',
        'fecha',
        'TRANSACTION_DATE_IN_FUTURE',
      ],
      ['an unknown type', '2026-09-01,Egreso,X,,1.00,PEN,A,,,,,', 'tipo', 'IMPORT_TYPE_UNKNOWN'],
      [
        'an unknown currency',
        '2026-09-01,Ingreso,X,,1.00,EUR,A,,,,,',
        'moneda',
        'INVALID_CURRENCY',
      ],
      [
        'a decimal comma',
        '2026-09-01,Ingreso,X,,"25,90",PEN,A,,,,,',
        'monto',
        'INVALID_AMOUNT_TEXT',
      ],
      [
        'an ambiguous amount',
        '2026-09-01,Ingreso,X,,"1.234,50",PEN,A,,,,,',
        'monto',
        'INVALID_AMOUNT_TEXT',
      ],
      [
        'a negative amount',
        '2026-09-01,Ingreso,X,,-25.90,PEN,A,,,,,',
        'monto',
        'TRANSACTION_AMOUNT_NOT_POSITIVE',
      ],
      [
        'a zero amount',
        '2026-09-01,Ingreso,X,,0.00,PEN,A,,,,,',
        'monto',
        'TRANSACTION_AMOUNT_NOT_POSITIVE',
      ],
      [
        'a symbol of another currency',
        '2026-09-01,Ingreso,X,,US$ 20,PEN,A,,,,,',
        'monto',
        'IMPORT_CURRENCY_MISMATCH',
      ],
      [
        'a blank description',
        '2026-09-01,Ingreso,X,,1.00,PEN, ,,,,,',
        'descripcion',
        'IMPORT_FIELD_REQUIRED',
      ],
      [
        'a transaction without category',
        '2026-09-01,Ingreso,,,1.00,PEN,A,,,,,',
        'categoria',
        'IMPORT_FIELD_REQUIRED',
      ],
      [
        'a tag with nothing in it',
        '2026-09-01,Ingreso,X,,1.00,PEN,A,,,,,a||b',
        'etiquetas',
        'TAG_NAME_INVALID',
      ],
      [
        'a transaction with a destination',
        '2026-09-01,Ingreso,X,,1.00,PEN,A,,,Yape,,',
        'destino',
        'IMPORT_FIELD_NOT_ALLOWED',
      ],
    ])('%s', (_case, line, field, code) => {
      expect(codesOf(line)).toEqual([[field, code]]);
    });

    it.each([
      [
        'a category',
        '2026-09-04,Transferencia,Comida,,50.00,PEN,A,BCP,,Yape,,',
        'categoria',
        'IMPORT_FIELD_NOT_ALLOWED',
      ],
      [
        'tags',
        '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,,Yape,,viaje',
        'etiquetas',
        'IMPORT_FIELD_NOT_ALLOWED',
      ],
      [
        'a merchant',
        '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,Tambo,Yape,,',
        'comercio',
        'IMPORT_FIELD_NOT_ALLOWED',
      ],
      [
        'no origin',
        '2026-09-04,Transferencia,,,50.00,PEN,A,,,Yape,,',
        'metodo_pago',
        'IMPORT_FIELD_REQUIRED',
      ],
      [
        'no destination',
        '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,,,,',
        'destino',
        'IMPORT_FIELD_REQUIRED',
      ],
      [
        'a zero amount',
        '2026-09-04,Transferencia,,,0,PEN,A,BCP,,Yape,,',
        'monto',
        'TRANSFER_AMOUNT_NOT_POSITIVE',
      ],
      [
        'a bad amount received',
        '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,,Yape,"10,00",',
        'monto_destino',
        'INVALID_AMOUNT_TEXT',
      ],
    ])('a transfer with %s', (_case, line, field, code) => {
      expect(codesOf(line)).toEqual([[field, code]]);
    });

    it('lists several problems of the same row together, with a message each', () => {
      const result = interpret('2026-02-30,Egreso,X,,abc,PEN,,,,,,');
      if ('row' in result) throw new Error('Expected problems');

      expect(result.problems.map((problem) => problem.field)).toEqual([
        'fecha',
        'tipo',
        'monto',
        'descripcion',
      ]);
      expect(result.problems.every((problem) => problem.line === 2 && problem.message !== '')).toBe(
        true,
      );
    });

    it('does not judge the amount when the currency is unknown', () => {
      expect(codesOf('2026-09-01,Ingreso,X,,abc,EUR,A,,,,,')).toEqual([
        ['moneda', 'INVALID_CURRENCY'],
      ]);
    });

    it('does not judge the amount received when the currency is unknown', () => {
      expect(codesOf('2026-09-04,Transferencia,,,50.00,EUR,A,BCP,,Yape,10.00,')).toEqual([
        ['moneda', 'INVALID_CURRENCY'],
      ]);
    });

    // Una celda obligatoria vacía dice que falta, no que su formato es malo.
    it.each([
      ['fecha', ',Ingreso,X,,1.00,PEN,A,,,,,'],
      ['tipo', '2026-09-01,,X,,1.00,PEN,A,,,,,'],
      ['monto', '2026-09-01,Ingreso,X,,,PEN,A,,,,,'],
      ['moneda', '2026-09-01,Ingreso,X,,1.00,,A,,,,,'],
    ])('says that an empty %s is missing', (field, line) => {
      expect(codesOf(line)).toEqual([[field, 'IMPORT_FIELD_REQUIRED']]);
    });

    it('explains each problem in its message', () => {
      const messages = (line: string): string[] => {
        const result = interpret(line);
        if ('row' in result) throw new Error('Expected problems');

        return result.problems.map((problem) => problem.message);
      };

      expect(messages('2026-09-01,Ingreso,X,,1.00,PEN,A,,,Yape,,')).toEqual([
        'This column must be empty in a transaction.',
      ]);
      expect(messages('2026-09-04,Transferencia,Comida,,50.00,PEN,A,BCP,,Yape,,')).toEqual([
        'This column must be empty in a transfer.',
      ]);
      expect(messages('2026-09-01,Ingreso,X,,US$ 20,PEN,A,,,,,')).toEqual([
        'The currency symbol of the amount is not the one of the currency column.',
      ]);
      expect(messages('2026-09-01,Ingreso,,,1.00,PEN,A,,,,,')).toEqual([
        'This column is required in this row.',
      ]);
      expect(messages('2026-09-01,Egreso,X,,1.00,PEN,A,,,,,')[0]).toMatch(/Unknown type/);
    });
  });

  it('reads a row shorter than the header as if the missing cells were empty', () => {
    expect(rowOf('2026-09-01,Ingreso,Sueldo,,100.00,PEN,Beca')).toMatchObject({
      merchant: null,
      tags: [],
    });
  });

  it('works with only the required columns, for transactions', () => {
    const csv = readCsv(
      'fecha,tipo,categoria,monto,moneda,descripcion\n2026-09-01,Ingreso,Sueldo,1.00,PEN,A',
    );
    const [row] = csv.rows;
    if (row === undefined) throw new Error('No row');

    expect(interpretImportRow(row, importLayout(csv.header), TODAY)).toMatchObject({
      row: { kind: 'transaction', paymentMethod: null },
    });
  });
});

describe('importFingerprints', () => {
  function rows(...lines: string[]): ImportedRow[] {
    return lines.map((line) => rowOf(line));
  }

  const LUNCH = '2026-09-01,Gasto variable,Comida,,10.00,PEN,Almuerzo,Yape,Tambo,,,';

  it('gives the same fingerprint to the same row, whatever the case or accents', () => {
    const [a, b] = importFingerprints(
      rows(LUNCH, '2026-09-01,GASTO VARIABLE,comida,,10,PEN,ALMUERZÓ,yape,TAMBO,,,'),
    );

    expect(a?.replace(/#\d+$/u, '')).toBe(b?.replace(/#\d+$/u, ''));
  });

  // Dos pasajes iguales el mismo día son dos filas: el número de aparición las distingue.
  it('numbers the repeated rows of a file, so both are imported', () => {
    const keys = importFingerprints(rows(LUNCH, LUNCH));

    expect(keys[0]).toMatch(/#1$/u);
    expect(keys[1]).toMatch(/#2$/u);
    expect(keys[0]?.replace(/#1$/u, '')).toBe(keys[1]?.replace(/#2$/u, ''));
  });

  /** La huella de una fila sola: siempre `#1`, así que se comparan las filas y no su orden. */
  function fingerprintOf(line: string): string | undefined {
    return importFingerprints(rows(line))[0];
  }

  it('ends with the occurrence number', () => {
    expect(fingerprintOf(LUNCH)).toMatch(/^\[.+\]#1$/u);
  });

  // La huella se guarda en la base: su forma no puede cambiar sin volver a importar todo.
  it('is written in a stable form', () => {
    expect(fingerprintOf('2026-09-01,Gasto variable,Comida,,10,PEN,Almuerzó,,,,,')).toBe(
      '["transaction","2026-09-01","VARIABLE_EXPENSE","10.00","PEN","almuerzo",""]#1',
    );
    expect(fingerprintOf('2026-09-04,Transferencia,,,50,PEN,A Yape,BCP,,Yape,,')).toBe(
      '["transfer","2026-09-04","50.00","PEN","a yape","bcp","yape"]#1',
    );
  });

  it.each([
    ['date', '2026-09-02,Gasto variable,Comida,,10.00,PEN,Almuerzo,Yape,Tambo,,,'],
    ['type', '2026-09-01,Gasto fijo,Comida,,10.00,PEN,Almuerzo,Yape,Tambo,,,'],
    ['amount', '2026-09-01,Gasto variable,Comida,,10.01,PEN,Almuerzo,Yape,Tambo,,,'],
    ['currency', '2026-09-01,Gasto variable,Comida,,10.00,USD,Almuerzo,Yape,Tambo,,,'],
    ['description', '2026-09-01,Gasto variable,Comida,,10.00,PEN,Cena,Yape,Tambo,,,'],
    ['merchant', '2026-09-01,Gasto variable,Comida,,10.00,PEN,Almuerzo,Yape,Oxxo,,,'],
  ])('tells rows apart by their %s', (_field, other) => {
    expect(fingerprintOf(LUNCH)).not.toBe(fingerprintOf(other));
  });

  const TO_YAPE = '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,,Yape,,';

  it.each([
    ['date', '2026-09-05,Transferencia,,,50.00,PEN,A,BCP,,Yape,,'],
    ['amount', '2026-09-04,Transferencia,,,50.01,PEN,A,BCP,,Yape,,'],
    ['currency', '2026-09-04,Transferencia,,,50.00,USD,A,BCP,,Yape,,'],
    ['description', '2026-09-04,Transferencia,,,50.00,PEN,B,BCP,,Yape,,'],
    ['origin', '2026-09-04,Transferencia,,,50.00,PEN,A,Lemon,,Yape,,'],
    ['destination', '2026-09-04,Transferencia,,,50.00,PEN,A,BCP,,Lemon,,'],
  ])('tells transfers apart by their %s', (_field, other) => {
    expect(fingerprintOf(TO_YAPE)).not.toBe(fingerprintOf(other));
  });

  it('gives the same fingerprint to the same transfer, whatever the case or accents', () => {
    expect(fingerprintOf(TO_YAPE)).toBe(
      fingerprintOf('2026-09-04,TRANSFERENCIA,,,50,PEN,a,bcp,,YAPE,,'),
    );
  });
});

describe('MissingImportColumnsError', () => {
  it('has a stable code', () => {
    const error = new MissingImportColumnsError(['fecha']);

    expect(error.code).toBe('IMPORT_COLUMNS_MISSING');
    expect(error.name).toBe('MissingImportColumnsError');
  });
});
