import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const PREVIEW = `${TRANSACTIONS}/import/preview`;
const IMPORT = `${TRANSACTIONS}/import`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const HEADER =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';

/** Una hoja **inventada** con la forma de la del autor. Ningún dato es real. */
const SHEET = [
  `${HEADER},Mes`,
  '2026-03-01,Ingreso,Sueldo o Salario,,1500.00,PEN,Beca,BCP Digital Soles,,,,,Marzo',
  '2026-03-02,Gasto variable,Comida,Almuerzo,11.00,PEN,Menú,Yape,,,,almuerzo,Marzo',
  '2026-03-02,Gasto variable,Comida,Almuerzo,11.00,PEN,Menú,Yape,,,,almuerzo,Marzo',
  '2026-03-03,Transferencia,,,50.00,PEN,Paso a Yape,BCP Digital Soles,,Yape,,,Marzo',
  '2026-03-04,Transferencia,,,37.51,PEN,Dólares,Interbank Simple Soles,,Interbank Simple Dólares,10.03,,Marzo',
  '2026-03-05,Gasto fijo,Suscripciones,Streaming,10.00,USD,Streaming,Interbank Simple Dólares,Netflix,,,,Marzo',
].join('\n');

/** Lo que el autor decidiría tras ver la vista previa de `SHEET`. */
const DECISIONS = {
  categories: [
    { type: 'VARIABLE_EXPENSE', category: 'Comida', subcategory: 'Almuerzo', action: 'create' },
    {
      type: 'FIXED_EXPENSE',
      category: 'Suscripciones',
      subcategory: 'Streaming',
      action: 'create',
    },
  ],
  paymentMethods: [
    { alias: 'Yape', action: 'create', kind: 'WALLET', institution: 'BCP', currency: 'PEN' },
  ],
};

interface ResultBody {
  transactions: number;
  transfers: number;
  alreadyImported: number[];
  createdCategories: number;
  createdPaymentMethods: number;
  restored: number;
}

describe('importing a CSV', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_TRANSACTIONS = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = TOTP_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    process.env.FEATURE_TRANSACTIONS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    for (const [alias, currency] of [
      ['BCP Digital Soles', 'PEN'],
      ['Interbank Simple Soles', 'PEN'],
      ['Interbank Simple Dólares', 'USD'],
    ] as const) {
      await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ kind: 'ACCOUNT', alias, institution: 'Banco', currency })
        .expect(201);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  function importing(body: object, session = ana): request.Test {
    return request(server).post(IMPORT).set('Authorization', `Bearer ${session}`).send(body);
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  async function userId(email: string): Promise<string> {
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  }

  it('imports a sheet like the author’s, from preview to confirmation', async () => {
    const preview = await request(server)
      .post(PREVIEW)
      .set('Authorization', `Bearer ${ana}`)
      .send({ csv: SHEET })
      .expect(200);
    expect(preview.body).toMatchObject({ transactions: 4, transfers: 2, problems: [] });

    const response = await importing({ csv: SHEET, ...DECISIONS }).expect(201);

    expect(response.body).toEqual({
      transactions: 4,
      transfers: 2,
      alreadyImported: [],
      createdCategories: 2,
      createdPaymentMethods: 1,
      restored: 0,
    });
    const owner = await userId(ANA.email);
    const rows = await prisma.transaction.findMany({
      where: { userId: owner },
      include: { category: true, paymentMethod: true, tags: { include: { tag: true } } },
      orderBy: { id: 'asc' },
    });
    expect(
      rows.map((row) => [row.source, row.category.name, row.paymentMethod?.alias ?? null]),
    ).toEqual([
      ['IMPORT', 'Sueldo o Salario', 'BCP Digital Soles'],
      ['IMPORT', 'Almuerzo', 'Yape'],
      ['IMPORT', 'Almuerzo', 'Yape'],
      ['IMPORT', 'Streaming', 'Interbank Simple Dólares'],
    ]);
    expect(rows[1]?.tags.map((link) => link.tag.name)).toEqual(['almuerzo']);
    expect(rows.every((row) => row.importKey?.length === 64)).toBe(true);
  });

  it('keeps the amounts exact, both sides of a currency change included', async () => {
    await importing({ csv: SHEET, ...DECISIONS }).expect(201);

    const rows = await prisma.$queryRaw<{ amount: string; received: string; currency: string }[]>`
      SELECT amount::text AS amount, received_amount::text AS received,
             received_currency::text AS currency
        FROM transfers ORDER BY date`;

    expect(rows).toEqual([
      { amount: '50.00', received: '50.00', currency: 'PEN' },
      { amount: '37.51', received: '10.03', currency: 'USD' },
    ]);
  });

  it('shows the imported rows in the list, marked as imported', async () => {
    await importing({ csv: SHEET, ...DECISIONS }).expect(201);

    const response = await request(server)
      .get(TRANSACTIONS)
      .query({ month: '2026-03' })
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    const items = (response.body as { items: { kind: string; source: string }[] }).items;
    expect(items).toHaveLength(6);
    expect(items.every((item) => item.source === 'IMPORT')).toBe(true);
  });

  it('does not duplicate when the same file is imported again', async () => {
    await importing({ csv: SHEET, ...DECISIONS }).expect(201);

    const again = await importing({ csv: SHEET, ...DECISIONS }).expect(201);

    expect(again.body as ResultBody).toMatchObject({
      transactions: 0,
      transfers: 0,
      alreadyImported: [2, 3, 4, 5, 6, 7],
    });
    await expect(prisma.transaction.count()).resolves.toBe(4);
    await expect(prisma.transfer.count()).resolves.toBe(2);
  });

  // La base decide: dos importaciones del mismo archivo a la vez no duplican nada.
  it('lets only one of two simultaneous imports of the same file through', async () => {
    const file = [
      HEADER,
      ...Array.from(
        { length: 50 },
        (_, index) => `2026-03-01,Ingreso,Sueldo o Salario,,1.00,PEN,Fila ${String(index)},,,,,`,
      ),
    ].join('\n');

    const responses = await Promise.all([importing({ csv: file }), importing({ csv: file })]);

    const statuses = responses.map((response) => response.status).toSorted();
    expect(statuses).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(codeOf(conflict as request.Response)).toBe(problemType('IMPORT_CONFLICT'));
    await expect(prisma.transaction.count()).resolves.toBe(50);
  });

  it('imports a file of several batches, with its tags', async () => {
    const rows = Array.from(
      { length: 1200 },
      (_, index) =>
        `2026-03-01,Gasto variable,Comida,,1.00,PEN,Fila ${String(index)},,,,,${index % 2 === 0 ? 'par' : 'impar'}`,
    );

    const response = await importing({ csv: [HEADER, ...rows].join('\n') }).expect(201);

    expect(response.body).toMatchObject({ transactions: 1200 });
    await expect(prisma.transactionTag.count()).resolves.toBe(1200);
    await expect(prisma.tag.count()).resolves.toBe(2);
  });

  describe('imports all or nothing', () => {
    it('rejects a file with a problem, saving nothing', async () => {
      const response = await importing({
        csv: `${SHEET}\n2026-03-06,Egreso,Comida,,5.00,PEN,Algo,,,,,,Marzo`,
        ...DECISIONS,
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('IMPORT_HAS_PROBLEMS'));
      await expect(prisma.transaction.count()).resolves.toBe(0);
      await expect(prisma.paymentMethod.count({ where: { alias: 'Yape' } })).resolves.toBe(0);
    });

    it('rejects a missing decision, saving nothing', async () => {
      const response = await importing({ csv: SHEET, categories: DECISIONS.categories }).expect(
        422,
      );

      expect(codeOf(response)).toBe(problemType('IMPORT_UNRESOLVED'));
      await expect(prisma.transaction.count()).resolves.toBe(0);
      await expect(prisma.category.count({ where: { name: 'Almuerzo' } })).resolves.toBe(0);
    });

    it('rejects a new payment method that breaks the rules of its kind', async () => {
      const response = await importing({
        csv: SHEET,
        categories: DECISIONS.categories,
        paymentMethods: [
          { alias: 'Yape', action: 'create', kind: 'CREDIT_CARD', institution: 'BCP' },
        ],
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('LAST4_REQUIRED'));
      await expect(prisma.transaction.count()).resolves.toBe(0);
    });
  });

  describe('never mixes accounts', () => {
    it('refuses to put rows in a category of another account', async () => {
      const other = await userId(BRUNO.email);
      const hers = await prisma.category.findFirstOrThrow({
        where: { userId: other, name: 'Comida' },
      });

      const response = await importing({
        csv: `${HEADER}\n2026-03-01,Gasto variable,Snacks,,1.00,PEN,A,,,,,`,
        categories: [
          {
            type: 'VARIABLE_EXPENSE',
            category: 'Snacks',
            subcategory: null,
            action: 'use',
            categoryId: hers.id,
          },
        ],
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('IMPORT_DECISION_INVALID'));
      await expect(prisma.transaction.count()).resolves.toBe(0);
    });

    it('refuses to put rows in a payment method of another account', async () => {
      const created = await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${bruno}`)
        .send({ kind: 'CASH', alias: 'Efectivo de Bruno' })
        .expect(201);

      const response = await importing({
        csv: `${HEADER}\n2026-03-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,Efectivo,,,,`,
        paymentMethods: [
          {
            alias: 'Efectivo',
            action: 'use',
            paymentMethodId: (created.body as { id: string }).id,
          },
        ],
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('IMPORT_DECISION_INVALID'));
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      await request(server).post(IMPORT).send({ csv: SHEET }).expect(401);
    });

    it('refuses a personal access token', async () => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await request(server)
        .post(IMPORT)
        .set('Authorization', `Bearer ${token}`)
        .send({ csv: SHEET })
        .expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while transactions is off', async () => {
      process.env.FEATURE_TRANSACTIONS = 'false';

      await importing({ csv: SHEET }).expect(404);
    });
  });
});
