import type { CategoryDecision, PaymentMethodDecision } from '@sol-a-sol/contracts';
import { FixedClock, Last4RequiredError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import {
  ImportDecisionInvalidError,
  ImportHasProblemsError,
  ImportUnresolvedError,
} from '../domain/errors.js';
import { TRANSACTION_CREATED, TRANSFER_CREATED } from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCatalogWriter } from '../ports/catalog-writer.fake.js';
import { FakeImportWriter } from '../ports/import-writer.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { FakeTransferRepository } from '../ports/transfer-repository.fake.js';
import { ConfirmImport } from './import-confirm.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const NOW = '2026-09-28T15:00:00.000Z';
const HEADER =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

describe('confirming an import', () => {
  let transactions: FakeTransactionRepository;
  let transfers: FakeTransferRepository;
  let catalog: FakeCatalogReader;
  let writer: FakeCatalogWriter;
  let events: RecordingEventPublisher;
  let confirm: ConfirmImport;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    transfers = new FakeTransferRepository();
    catalog = new FakeCatalogReader()
      .withCategory(ANA, 'food', { type: 'VARIABLE_EXPENSE', name: 'Comida' })
      .withCategory(ANA, 'drinks', { type: 'VARIABLE_EXPENSE', name: 'Bebidas', parentId: 'food' })
      .withCategory(ANA, 'salary', { type: 'INCOME', name: 'Sueldo o Salario' })
      .withCategory(ANA, 'subs', { type: 'FIXED_EXPENSE', name: 'Suscripciones', archived: true })
      .withCategory(ANA, 'netflix', {
        type: 'FIXED_EXPENSE',
        name: 'Netflix',
        parentId: 'subs',
        archived: true,
      })
      .withCategory(BRUNO, 'bruno-food', { type: 'VARIABLE_EXPENSE', name: 'Comida' })
      .withPaymentMethod(ANA, 'digital', { currency: 'PEN', alias: 'BCP Digital Soles' })
      .withPaymentMethod(ANA, 'yape', { currency: 'PEN', alias: 'BCP Yape Soles' })
      .withPaymentMethod(ANA, 'old-card', { currency: 'PEN', alias: 'Visa vieja', archived: true })
      .withPaymentMethod(BRUNO, 'bruno-yape', { currency: 'PEN', alias: 'Lemon' });
    writer = new FakeCatalogWriter(catalog);
    events = new RecordingEventPublisher();
    confirm = new ConfirmImport(
      transactions,
      transfers,
      catalog,
      writer,
      new FakeImportWriter(transactions, transfers),
      events,
      FixedClock.at(NOW),
    );
  });

  function run(
    file: string,
    categories: CategoryDecision[] = [],
    paymentMethods: PaymentMethodDecision[] = [],
    userId = ANA,
  ) {
    return confirm.execute({ userId, csv: file, categories, paymentMethods });
  }

  function nothingWritten(): void {
    expect(transactions.rows).toEqual([]);
    expect(transfers.rows).toEqual([]);
    expect(writer.created).toEqual([]);
    expect(writer.restored).toEqual([]);
    expect(events.published).toEqual([]);
  }

  it('imports a file where everything exists, as IMPORT and with its fingerprint', async () => {
    const result = await run(
      csv(
        '2026-09-01,Ingreso,Sueldo o Salario,,1299.95,PEN,Beca,BCP Digital Soles,,,,',
        '2026-09-02,Gasto variable,comida,bebidas,2.00,PEN,Gaseosa,bcp yape soles,Tambo,,,snack',
        '2026-09-03,Transferencia,,,50.00,PEN,A Yape,BCP Digital Soles,,BCP Yape Soles,,',
      ),
    );

    expect(result).toEqual({
      transactions: 2,
      transfers: 1,
      alreadyImported: [],
      createdCategories: 0,
      createdPaymentMethods: 0,
      restored: 0,
    });
    expect(
      transactions.rows.map((row) => [row.categoryId, row.paymentMethodId, row.source]),
    ).toEqual([
      ['salary', 'digital', 'IMPORT'],
      ['drinks', 'yape', 'IMPORT'],
    ]);
    expect(transactions.rows.every((row) => /^[0-9a-f]{64}$/u.test(row.importKey ?? ''))).toBe(
      true,
    );
    await expect(transactions.find(ANA, transactions.rows[1]?.id ?? '')).resolves.toMatchObject({
      tags: ['snack'],
    });
    expect(transfers.rows).toMatchObject([
      { fromPaymentMethodId: 'digital', toPaymentMethodId: 'yape', source: 'IMPORT' },
    ]);
  });

  // El presupuesto (H4) se entera de cada una, igual que si se registraran a mano.
  it('announces each transaction and transfer created', async () => {
    await run(
      csv(
        '2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
        '2026-09-03,Transferencia,,,50.00,PEN,A Yape,BCP Digital Soles,,BCP Yape Soles,,',
      ),
    );

    expect(events.published.map((event) => event.name)).toEqual([
      TRANSACTION_CREATED,
      TRANSFER_CREATED,
    ]);
  });

  it('skips the rows already imported, so importing twice does not duplicate', async () => {
    const file = csv(
      '2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
      '2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
    );
    await run(file);

    const again = await run(file);

    expect(again).toMatchObject({ transactions: 0, alreadyImported: [2, 3] });
    expect(transactions.rows).toHaveLength(2);
  });

  describe('resolves the categories as decided', () => {
    it('creates a missing category and its subcategory, the parent only once', async () => {
      const result = await run(
        csv(
          '2026-09-01,Gasto variable,Compras,Poncho,57.30,PEN,Poncho,,,,,',
          '2026-09-02,Gasto variable,Compras,Temu,36.00,PEN,Temu,,,,,',
          '2026-09-03,Gasto variable,compras,poncho,10.00,PEN,Otro,,,,,',
        ),
        [
          {
            type: 'VARIABLE_EXPENSE',
            category: 'Compras',
            subcategory: 'Poncho',
            action: 'create',
          },
          { type: 'VARIABLE_EXPENSE', category: 'Compras', subcategory: 'Temu', action: 'create' },
        ],
      );

      expect(result.createdCategories).toBe(3);
      const created = await catalog.allCategories(ANA);
      const shopping = created.find((category) => category.name === 'Compras');
      const poncho = created.find((category) => category.name === 'Poncho');
      expect(poncho?.parentId).toBe(shopping?.id);
      expect(transactions.rows.map((row) => row.categoryId)).toEqual([
        poncho?.id,
        created.find((category) => category.name === 'Temu')?.id,
        poncho?.id,
      ]);
    });

    it('creates only the subcategory under an existing parent', async () => {
      const result = await run(
        csv('2026-09-01,Gasto variable,Comida,Almuerzo,11.00,PEN,Menú,,,,,'),
        [
          {
            type: 'VARIABLE_EXPENSE',
            category: 'Comida',
            subcategory: 'Almuerzo',
            action: 'create',
          },
        ],
      );

      expect(result.createdCategories).toBe(1);
      const lunch = (await catalog.allCategories(ANA)).find((c) => c.name === 'Almuerzo');
      expect(lunch?.parentId).toBe('food');
    });

    it('puts the rows in another existing category of the same type', async () => {
      await run(csv('2026-09-01,Gasto variable,Snacks,,3.00,PEN,Dulces,,,,,'), [
        {
          type: 'VARIABLE_EXPENSE',
          category: 'Snacks',
          subcategory: null,
          action: 'use',
          categoryId: 'drinks',
        },
      ]);

      expect(transactions.rows.map((row) => row.categoryId)).toEqual(['drinks']);
    });

    it('restores an archived category and its archived parent', async () => {
      const result = await run(
        csv('2026-09-01,Gasto fijo,Suscripciones,Netflix,13.90,PEN,Streaming,,,,,'),
        [
          {
            type: 'FIXED_EXPENSE',
            category: 'Suscripciones',
            subcategory: 'Netflix',
            action: 'restore',
          },
        ],
      );

      expect(result.restored).toBe(2);
      expect(writer.restored).toEqual(['subs', 'netflix']);
      expect(transactions.rows.map((row) => row.categoryId)).toEqual(['netflix']);
    });

    it.each<[string, CategoryDecision]>([
      [
        'creating what exists archived',
        {
          type: 'FIXED_EXPENSE',
          category: 'Suscripciones',
          subcategory: 'Netflix',
          action: 'create',
        },
      ],
      [
        'using a category of another type',
        {
          type: 'FIXED_EXPENSE',
          category: 'Suscripciones',
          subcategory: 'Netflix',
          action: 'use',
          categoryId: 'salary',
        },
      ],
      [
        'using an archived category',
        {
          type: 'FIXED_EXPENSE',
          category: 'Suscripciones',
          subcategory: 'Netflix',
          action: 'use',
          categoryId: 'subs',
        },
      ],
    ])('rejects %s, writing nothing', async (_case, decision) => {
      await expect(
        run(csv('2026-09-01,Gasto fijo,Suscripciones,Netflix,13.90,PEN,Streaming,,,,,'), [
          decision,
        ]),
      ).rejects.toThrow(ImportDecisionInvalidError);
      nothingWritten();
    });

    it('rejects restoring what does not exist', async () => {
      await expect(
        run(csv('2026-09-01,Gasto variable,Compras,,1.00,PEN,A,,,,,'), [
          { type: 'VARIABLE_EXPENSE', category: 'Compras', subcategory: null, action: 'restore' },
        ]),
      ).rejects.toThrow(ImportDecisionInvalidError);
      nothingWritten();
    });

    it('rejects using a category of another account', async () => {
      await expect(
        run(csv('2026-09-01,Gasto variable,Compras,,1.00,PEN,A,,,,,'), [
          {
            type: 'VARIABLE_EXPENSE',
            category: 'Compras',
            subcategory: null,
            action: 'use',
            categoryId: 'bruno-food',
          },
        ]),
      ).rejects.toThrow(ImportDecisionInvalidError);
      nothingWritten();
    });

    it('rejects a missing category without a decision, naming it', async () => {
      await expect(
        run(csv('2026-09-01,Gasto variable,Compras,Poncho,1.00,PEN,A,,,,,')),
      ).rejects.toThrow(ImportUnresolvedError);
      await expect(
        run(csv('2026-09-01,Gasto variable,Compras,Poncho,1.00,PEN,A,,,,,')),
      ).rejects.toThrow(/Compras > Poncho/);
      nothingWritten();
    });
  });

  describe('resolves the payment methods as decided', () => {
    it('creates a missing method, once for every row that uses it', async () => {
      const result = await run(
        csv(
          '2026-09-01,Gasto variable,Comida,,11.00,PEN,Almuerzo,Lemon,,,,',
          '2026-09-02,Gasto variable,Comida,,5.00,PEN,Cena,lemon,,,,',
        ),
        [],
        [
          {
            alias: 'Lemon',
            action: 'create',
            kind: 'WALLET',
            institution: 'Lemon',
            currency: 'PEN',
          },
        ],
      );

      expect(result.createdPaymentMethods).toBe(1);
      const lemon = (await catalog.allPaymentMethods(ANA)).find((m) => m.alias === 'Lemon');
      expect(transactions.rows.map((row) => row.paymentMethodId)).toEqual([lemon?.id, lemon?.id]);
    });

    it('puts the rows in another existing method', async () => {
      await run(
        csv('2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,Beca,Transferencia,,,,'),
        [],
        [{ alias: 'Transferencia', action: 'use', paymentMethodId: 'digital' }],
      );

      expect(transactions.rows.map((row) => row.paymentMethodId)).toEqual(['digital']);
    });

    it('restores an archived method', async () => {
      const result = await run(
        csv('2026-09-01,Gasto variable,Comida,,5.00,PEN,Salida,Visa vieja,,,,'),
        [],
        [{ alias: 'Visa vieja', action: 'restore' }],
      );

      expect(result.restored).toBe(1);
      expect(transactions.rows.map((row) => row.paymentMethodId)).toEqual(['old-card']);
    });

    it('creates the destination of a currency change with its currency', async () => {
      await run(
        csv(
          '2026-09-10,Transferencia,,,37.50,PEN,Dólares,BCP Digital Soles,,Interbank Dólares,10.00,',
        ),
        [],
        [
          {
            alias: 'Interbank Dólares',
            action: 'create',
            kind: 'ACCOUNT',
            institution: 'Interbank',
            currency: 'USD',
          },
        ],
      );

      expect(transfers.rows).toHaveLength(1);
      const [transfer] = transfers.rows;
      expect(`${transfer?.amount.toFixed() ?? ''} ${transfer?.amount.currency ?? ''}`).toBe(
        '37.50 PEN',
      );
      expect(
        `${transfer?.receivedAmount.toFixed() ?? ''} ${transfer?.receivedAmount.currency ?? ''}`,
      ).toBe('10.00 USD');
    });

    // Las mismas reglas que a mano: una tarjeta de crédito necesita sus últimos 4.
    it('rejects creating a method that breaks the rules of its kind, before writing anything', async () => {
      await expect(
        run(
          csv('2026-09-01,Gasto variable,Comida,,5.00,PEN,Cena,Visa BCP,,,,'),
          [],
          [{ alias: 'Visa BCP', action: 'create', kind: 'CREDIT_CARD', institution: 'BCP' }],
        ),
      ).rejects.toThrow(Last4RequiredError);
      nothingWritten();
    });

    it.each<[string, PaymentMethodDecision]>([
      ['restoring what does not exist', { alias: 'Lemon', action: 'restore' }],
      [
        'using a method of another account',
        { alias: 'Lemon', action: 'use', paymentMethodId: 'bruno-yape' },
      ],
      ['using an archived method', { alias: 'Lemon', action: 'use', paymentMethodId: 'old-card' }],
    ])('rejects %s, writing nothing', async (_case, decision) => {
      await expect(
        run(csv('2026-09-01,Gasto variable,Comida,,5.00,PEN,A,Lemon,,,,'), [], [decision]),
      ).rejects.toThrow(ImportDecisionInvalidError);
      nothingWritten();
    });

    it('rejects creating what exists archived', async () => {
      await expect(
        run(
          csv('2026-09-01,Gasto variable,Comida,,5.00,PEN,A,Visa vieja,,,,'),
          [],
          [{ alias: 'Visa vieja', action: 'create', kind: 'CASH' }],
        ),
      ).rejects.toThrow(ImportDecisionInvalidError);
      nothingWritten();
    });

    it('rejects a missing method without a decision, naming it', async () => {
      await expect(
        run(csv('2026-09-01,Gasto variable,Comida,,5.00,PEN,A,Yape,,,,')),
      ).rejects.toThrow(/payment method "Yape"/);
      nothingWritten();
    });
  });

  describe('imports all or nothing', () => {
    it('rejects the whole file when a row has a problem', async () => {
      await expect(
        run(
          csv(
            '2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,,,,,',
            '2026-09-02,Egreso,Comida,,1.00,PEN,B,,,,,',
          ),
        ),
      ).rejects.toThrow(ImportHasProblemsError);
      nothingWritten();
    });

    it('rejects a value too long for what is saved', async () => {
      await expect(
        run(csv(`2026-09-01,Ingreso,Sueldo o Salario,,1.00,PEN,${'x'.repeat(201)},,,,,`)),
      ).rejects.toThrow(ImportHasProblemsError);
      nothingWritten();
    });

    it('judges a transfer with the final currency of a new account', async () => {
      await expect(
        run(
          csv(
            '2026-09-10,Transferencia,,,37.50,PEN,Dólares,BCP Digital Soles,,Interbank Dólares,,',
          ),
          [],
          [
            {
              alias: 'Interbank Dólares',
              action: 'create',
              kind: 'ACCOUNT',
              institution: 'Interbank',
              currency: 'USD',
            },
          ],
        ),
      ).rejects.toThrow(ImportHasProblemsError);
      nothingWritten();
    });

    // Dos alias distintos que se deciden como la misma cuenta dejan una transferencia a sí misma.
    it('rejects a transfer whose two aliases end in the same account', async () => {
      await expect(
        run(
          csv('2026-09-03,Transferencia,,,50.00,PEN,A,Transferencia,,BCP Digital Soles,,'),
          [],
          [{ alias: 'Transferencia', action: 'use', paymentMethodId: 'digital' }],
        ),
      ).rejects.toThrow(ImportHasProblemsError);
      nothingWritten();
    });

    it('says how many rows have problems', async () => {
      await expect(
        run(
          csv(
            '2026-09-02,Egreso,Comida,,1.00,PEN,B,,,,,',
            '2026-02-30,Egreso,Comida,,1.00,PEN,B,,,,,',
          ),
        ),
      ).rejects.toThrow(/^2 row\(s\) have problems/u);
    });
  });

  it('never uses what belongs to another account', async () => {
    await expect(
      run(csv('2026-09-01,Gasto variable,Comida,,1.00,PEN,A,Lemon,,,,')),
    ).rejects.toThrow(ImportUnresolvedError);

    await run(csv('2026-09-01,Gasto variable,Comida,,1.00,PEN,A,,,,,'), [], [], BRUNO);
    expect(transactions.rows.map((row) => [row.userId, row.categoryId])).toEqual([
      [BRUNO, 'bruno-food'],
    ]);
  });
});
