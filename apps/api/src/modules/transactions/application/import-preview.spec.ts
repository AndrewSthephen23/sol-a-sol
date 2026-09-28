import {
  FixedClock,
  LocalDate,
  MalformedCsvError,
  MissingImportColumnsError,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportFileTooLargeError, ImportTooManyRowsError } from '../domain/errors.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTagRepository } from '../ports/tag-repository.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { FakeTransferRepository } from '../ports/transfer-repository.fake.js';
import { importKeyOf, PreviewImport, readImportFile } from './import-preview.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const NOW = '2026-09-28T15:00:00.000Z';
const HEADER =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

describe('previewing an import', () => {
  let transactions: FakeTransactionRepository;
  let transfers: FakeTransferRepository;
  let preview: PreviewImport;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    transfers = new FakeTransferRepository();
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, 'food', { type: 'VARIABLE_EXPENSE', name: 'Comida' })
      .withCategory(ANA, 'delivery', {
        type: 'VARIABLE_EXPENSE',
        name: 'Delivery',
        parentId: 'food',
      })
      .withCategory(ANA, 'old-snacks', {
        type: 'VARIABLE_EXPENSE',
        name: 'Snacks',
        parentId: 'food',
        archived: true,
      })
      .withCategory(ANA, 'salary', { type: 'INCOME', name: 'Sueldo o Salario' })
      .withCategory(ANA, 'netflix', { type: 'FIXED_EXPENSE', name: 'Netflix', archived: true })
      .withCategory(BRUNO, 'bruno-rent', { type: 'FIXED_EXPENSE', name: 'Alquiler' })
      .withPaymentMethod(ANA, 'digital', { currency: 'PEN', alias: 'BCP Digital Soles' })
      .withPaymentMethod(ANA, 'yape', { currency: 'PEN', alias: 'BCP Yape Soles' })
      .withPaymentMethod(ANA, 'dollars', { currency: 'USD', alias: 'Interbank Simple Dólares' })
      .withPaymentMethod(ANA, 'old-card', { currency: 'PEN', alias: 'Visa vieja', archived: true })
      .withPaymentMethod(BRUNO, 'bruno-yape', { currency: 'PEN', alias: 'Lemon' });
    preview = new PreviewImport(
      transactions,
      transfers,
      catalog,
      new FakeTagRepository(transactions),
      FixedClock.at(NOW),
    );
  });

  function run(file: string, userId = ANA) {
    return preview.execute({ userId, csv: file });
  }

  it('counts what would enter, with nothing to resolve', async () => {
    await expect(
      run(
        csv(
          '2026-09-01,Ingreso,Sueldo o Salario,,1299.95,PEN,Beca,BCP Digital Soles,,,,',
          '2026-09-02,Gasto variable,comida,delivery,32.50,PEN,Pizza,bcp yape soles,Rappi,,,',
          '2026-09-03,Transferencia,,,50.00,PEN,A Yape,BCP Digital Soles,,BCP Yape Soles,,',
        ),
      ),
    ).resolves.toEqual({
      rows: 3,
      transactions: 2,
      transfers: 1,
      alreadyImported: [],
      problems: [],
      ignoredColumns: [],
      categories: [],
      paymentMethods: [],
      newTags: [],
    });
  });

  it('lists the categories that are missing or archived, with the lines that use them', async () => {
    const result = await run(
      csv(
        '2026-09-01,Gasto variable,Compras,Poncho,57.30,PEN,Poncho,,,,,',
        '2026-09-02,Gasto variable,compras,PONCHO,10.00,PEN,Otro,,,,,',
        '2026-09-03,Gasto variable,Comida,Gaseosa,2.00,PEN,Gaseosa,,,,,',
        '2026-09-04,Gasto variable,Comida,Snacks,3.00,PEN,Dulces,,,,,',
        '2026-09-05,Gasto fijo,Netflix,,13.90,PEN,Streaming,,,,,',
        // "Comida" existe como gasto variable, no como ingreso: para un ingreso falta.
        '2026-09-06,Ingreso,Comida,,16.00,PEN,Me devolvieron,,,,,',
      ),
    );

    expect(result.categories).toEqual([
      {
        type: 'VARIABLE_EXPENSE',
        category: 'Compras',
        subcategory: 'Poncho',
        status: 'missing',
        lines: [2, 3],
      },
      {
        type: 'VARIABLE_EXPENSE',
        category: 'Comida',
        subcategory: 'Gaseosa',
        status: 'missing',
        lines: [4],
      },
      {
        type: 'VARIABLE_EXPENSE',
        category: 'Comida',
        subcategory: 'Snacks',
        status: 'archived',
        lines: [5],
      },
      {
        type: 'FIXED_EXPENSE',
        category: 'Netflix',
        subcategory: null,
        status: 'archived',
        lines: [6],
      },
      { type: 'INCOME', category: 'Comida', subcategory: null, status: 'missing', lines: [7] },
    ]);
    // Siguen contando: entran una vez resuelto lo que falta.
    expect(result.transactions).toBe(6);
  });

  it('lists the payment methods that are missing or archived, also as transfer accounts', async () => {
    const result = await run(
      csv(
        '2026-09-01,Gasto variable,Comida,,11.00,PEN,Almuerzo,Yape,,,,',
        '2026-09-02,Gasto variable,Comida,,5.00,PEN,Salida,Visa vieja,,,,',
        '2026-09-03,Transferencia,,,10.00,PEN,A Yape,Transferencia,,yape,,',
      ),
    );

    expect(result.paymentMethods).toEqual([
      { alias: 'Yape', status: 'missing', lines: [2, 4] },
      { alias: 'Visa vieja', status: 'archived', lines: [3] },
      { alias: 'Transferencia', status: 'missing', lines: [4] },
    ]);
    expect(result.transfers).toBe(1);
  });

  it('never sees the categories or methods of another account', async () => {
    const result = await run(csv('2026-09-01,Gasto fijo,Alquiler,,480.00,PEN,Renta,Lemon,,,,'));

    expect(result.categories).toMatchObject([{ category: 'Alquiler', status: 'missing' }]);
    expect(result.paymentMethods).toMatchObject([{ alias: 'Lemon', status: 'missing' }]);
  });

  describe('reports problems, and those rows do not enter', () => {
    it('by line and column, sorted by line', async () => {
      const result = await run(
        csv(
          '2026-09-02,Egreso,Comida,,1.00,PEN,A,,,,,',
          '2026-09-01,Gasto variable,Comida,,1.00,PEN,A,,,,,',
          '2026-02-30,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
        ),
      );

      expect(result.problems.map((p) => [p.line, p.field, p.code])).toEqual([
        [2, 'tipo', 'IMPORT_TYPE_UNKNOWN'],
        [4, 'fecha', 'INVALID_LOCAL_DATE'],
      ]);
      expect(result.transactions).toBe(1);
    });

    it.each([
      ['descripcion', `2026-09-01,Gasto variable,Comida,,1.00,PEN,${'x'.repeat(201)},,,,,`],
      ['comercio', `2026-09-01,Gasto variable,Comida,,1.00,PEN,A,,${'x'.repeat(81)},,,`],
      ['categoria', `2026-09-01,Gasto variable,${'x'.repeat(61)},,1.00,PEN,A,,,,,`],
      ['subcategoria', `2026-09-01,Gasto variable,Comida,${'x'.repeat(61)},1.00,PEN,A,,,,,`],
      ['etiquetas', `2026-09-01,Gasto variable,Comida,,1.00,PEN,A,,,,,${'x'.repeat(41)}`],
      [
        'descripcion',
        `2026-09-01,Transferencia,,,1.00,PEN,${'x'.repeat(201)},BCP Digital Soles,,BCP Yape Soles,,`,
      ],
    ])('a %s that is too long', async (field, line) => {
      const result = await run(csv(line));

      expect(result.problems.map((p) => [p.field, p.code])).toEqual([
        [field, 'IMPORT_FIELD_TOO_LONG'],
      ]);
      expect(result.transactions + result.transfers).toBe(0);
    });

    it.each([
      [
        'the same account on both sides',
        '2026-09-01,Transferencia,,,1.00,PEN,A,BCP Yape Soles,,bcp yape soles,,',
        'destino',
        'TRANSFER_SAME_ACCOUNT',
      ],
      [
        'a currency change without the amount received',
        '2026-09-01,Transferencia,,,37.50,PEN,A,BCP Digital Soles,,Interbank Simple Dólares,,',
        'monto_destino',
        'TRANSFER_RECEIVED_AMOUNT_REQUIRED',
      ],
      [
        'dollars out of an account in soles',
        '2026-09-01,Transferencia,,,10.00,USD,A,BCP Digital Soles,,Interbank Simple Dólares,,',
        'moneda',
        'TRANSFER_CURRENCY_MISMATCH',
      ],
    ])('a transfer with %s', async (_case, line, field, code) => {
      const result = await run(csv(line));

      expect(result.problems.map((p) => [p.field, p.code])).toEqual([[field, code]]);
      expect(result.transfers).toBe(0);
    });

    it('accepts a currency change with both amounts', async () => {
      const result = await run(
        csv(
          '2026-09-01,Transferencia,,,37.50,PEN,A,BCP Digital Soles,,Interbank Simple Dólares,10.00,',
        ),
      );

      expect(result).toMatchObject({ problems: [], transfers: 1 });
    });
  });

  it('marks the rows already imported and leaves them out of everything else', async () => {
    const line = '2026-09-01,Gasto variable,Compras,,57.30,PEN,Poncho,Yape,,,,';
    const [fingerprint] = readImportFile(csv(line), LocalDate.of(2026, 9, 28)).rows;
    await transactions.create({
      userId: ANA,
      date: LocalDate.of(2026, 9, 1),
      type: 'VARIABLE_EXPENSE',
      categoryId: 'food',
      amount: Money.of('57.30', 'PEN'),
      description: 'Poncho',
      paymentMethodId: null,
      merchant: null,
      source: 'IMPORT',
      tags: [],
      importKey: importKeyOf(fingerprint?.fingerprint ?? ''),
    });

    const result = await run(csv(line, line));

    expect(result).toMatchObject({
      rows: 2,
      transactions: 1,
      alreadyImported: [2],
      categories: [{ category: 'Compras', lines: [3] }],
      paymentMethods: [{ alias: 'Yape', lines: [3] }],
    });
  });

  it('recognizes an imported transfer too', async () => {
    const line = '2026-09-03,Transferencia,,,50.00,PEN,A Yape,BCP Digital Soles,,BCP Yape Soles,,';
    const [fingerprint] = readImportFile(csv(line), LocalDate.of(2026, 9, 28)).rows;
    await transfers.create({
      userId: ANA,
      date: LocalDate.of(2026, 9, 3),
      fromPaymentMethodId: 'digital',
      toPaymentMethodId: 'yape',
      amount: Money.of('50.00', 'PEN'),
      receivedAmount: Money.of('50.00', 'PEN'),
      description: 'A Yape',
      source: 'IMPORT',
      importKey: importKeyOf(fingerprint?.fingerprint ?? ''),
    });

    await expect(run(csv(line))).resolves.toMatchObject({ alreadyImported: [2], transfers: 0 });
  });

  it('does not take the imports of another account as its own', async () => {
    const line = '2026-09-01,Gasto variable,Comida,,10.00,PEN,A,,,,,';
    const [fingerprint] = readImportFile(csv(line), LocalDate.of(2026, 9, 28)).rows;
    await transactions.create({
      userId: BRUNO,
      date: LocalDate.of(2026, 9, 1),
      type: 'VARIABLE_EXPENSE',
      categoryId: 'x',
      amount: Money.of('10.00', 'PEN'),
      description: 'A',
      paymentMethodId: null,
      merchant: null,
      source: 'IMPORT',
      tags: [],
      importKey: importKeyOf(fingerprint?.fingerprint ?? ''),
    });

    await expect(run(csv(line))).resolves.toMatchObject({ alreadyImported: [], transactions: 1 });
  });

  it('lists the new tags once, with their first spelling, and not the existing ones', async () => {
    await transactions.create({
      userId: ANA,
      date: LocalDate.of(2026, 9, 1),
      type: 'VARIABLE_EXPENSE',
      categoryId: 'food',
      amount: Money.of('1.00', 'PEN'),
      description: 'Ya',
      paymentMethodId: null,
      merchant: null,
      source: 'MANUAL',
      tags: [{ name: 'almuerzo', key: 'almuerzo' }],
    });

    const result = await run(
      csv(
        '2026-09-02,Gasto variable,Comida,,10.00,PEN,A,,,,,Almuerzo|Oficina',
        '2026-09-03,Gasto variable,Comida,,10.00,PEN,B,,,,,oficina|Cena',
      ),
    );

    expect(result.newTags).toEqual(['Oficina', 'Cena']);
  });

  it('lists the columns it ignores', async () => {
    const result = await run(
      `${HEADER},Mes,Presupuesto\n2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,,Septiembre,100`,
    );

    expect(result.ignoredColumns).toEqual(['Mes', 'Presupuesto']);
  });

  describe('rejects the whole file', () => {
    it('when it weighs more than 1 MB, measured in bytes', async () => {
      // "ñ" pesa dos bytes: 600 000 caracteres son 1.2 MB.
      await expect(run(`${HEADER}\n${'ñ'.repeat(600_000)}`)).rejects.toThrow(
        ImportFileTooLargeError,
      );
    });

    it('when it has more than 5 000 rows', async () => {
      const rows = Array.from({ length: 5001 }, () => '2026-09-01,Ingreso,X,,1.00,PEN,A,,,,,');

      await expect(run(csv(...rows))).rejects.toThrow(ImportTooManyRowsError);
    });

    it('accepts exactly 5 000 rows', async () => {
      const rows = Array.from(
        { length: 5000 },
        () => '2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
      );

      await expect(run(csv(...rows))).resolves.toMatchObject({ rows: 5000, transactions: 5000 });
    });

    it('when it lacks a required column', async () => {
      await expect(run('fecha,tipo\n2026-09-01,Ingreso')).rejects.toThrow(
        MissingImportColumnsError,
      );
    });

    it('when it is not a well-formed CSV', async () => {
      await expect(run(`${HEADER}\n"sin cerrar`)).rejects.toThrow(MalformedCsvError);
    });
  });

  it('saves nothing', async () => {
    await run(csv('2026-09-01,Gasto variable,Compras,,57.30,PEN,Poncho,,,,,nueva'));

    expect(transactions.rows).toEqual([]);
    expect(transfers.rows).toEqual([]);
    expect(transactions.tags).toEqual([]);
  });
});
