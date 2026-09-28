import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LocalDate } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import {
  importKeyOf,
  readImportFile,
} from '../../src/modules/transactions/application/import-preview.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const PREVIEW = `/${API_PREFIX}/transactions/import/preview`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const HEADER =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';

/**
 * Una hoja **inventada** con la forma de la del autor: sus columnas, sus tipos, sus cuentas y sus
 * casos raros (una transferencia a Yape, un cambio de moneda, filas repetidas, un "Mes" que sobra).
 * Ningún dato es real.
 */
const SHEET = [
  `${HEADER},Mes`,
  '2026-03-01,Ingreso,Sueldo o Salario,,1500.00,PEN,Beca,BCP Digital Soles,,,,,Marzo',
  '2026-03-02,Gasto variable,Comida,Almuerzo,11.00,PEN,Menú,Yape,,,,almuerzo,Marzo',
  '2026-03-02,Gasto variable,Comida,Almuerzo,11.00,PEN,Menú,Yape,,,,almuerzo,Marzo',
  '2026-03-03,Transferencia,,,50.00,PEN,Paso a Yape,BCP Digital Soles,,Yape,,,Marzo',
  '2026-03-04,Transferencia,,,37.50,PEN,Dólares,Interbank Simple Soles,,Interbank Simple Dólares,10.00,,Marzo',
  '2026-03-05,Gasto fijo,Suscripciones,Streaming,10.00,USD,Streaming,Interbank Simple Dólares,,,,,Marzo',
  '2026-03-06,Egreso,Comida,,5.00,PEN,Algo,Yape,,,,,Marzo',
].join('\n');

interface PreviewBody {
  rows: number;
  transactions: number;
  transfers: number;
  alreadyImported: number[];
  problems: { line: number; field: string; code: string }[];
  ignoredColumns: string[];
  categories: { category: string; subcategory: string | null; status: string; lines: number[] }[];
  paymentMethods: { alias: string; status: string; lines: number[] }[];
  newTags: string[];
}

describe('previewing an import', () => {
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

  function preview(csv: string, session = ana): request.Test {
    return request(server).post(PREVIEW).set('Authorization', `Bearer ${session}`).send({ csv });
  }

  async function previewed(csv: string, session = ana): Promise<PreviewBody> {
    const response = await preview(csv, session).expect(200);

    return response.body as PreviewBody;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  it('tells what would enter from a sheet like the author’s, saving nothing', async () => {
    const result = await previewed(SHEET);

    expect(result).toMatchObject({
      rows: 7,
      // Las dos filas repetidas del almuerzo entran las dos.
      transactions: 4,
      transfers: 2,
      alreadyImported: [],
      problems: [{ line: 8, field: 'tipo', code: 'IMPORT_TYPE_UNKNOWN' }],
      ignoredColumns: ['Mes'],
      newTags: ['almuerzo'],
    });
    // La semilla de cada cuenta trae "Sueldo o Salario", "Comida" y "Suscripciones", pero no sus
    // subcategorías "Almuerzo" y "Streaming".
    expect(result.categories).toEqual([
      expect.objectContaining({ category: 'Comida', subcategory: 'Almuerzo', lines: [3, 4] }),
      expect.objectContaining({ category: 'Suscripciones', subcategory: 'Streaming', lines: [7] }),
    ]);
    expect(result.paymentMethods).toEqual([{ alias: 'Yape', status: 'missing', lines: [3, 4, 5] }]);
    await expect(prisma.transaction.count()).resolves.toBe(0);
    await expect(prisma.tag.count()).resolves.toBe(0);
  });

  it('marks the rows already imported, by their fingerprint', async () => {
    const line = '2026-03-01,Ingreso,Sueldo o Salario,,1500.00,PEN,Beca,BCP Digital Soles,,,,';
    const file = `${HEADER}\n${line}`;
    const [row] = readImportFile(file, LocalDate.of(2026, 9, 28)).rows;
    const account = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
    const salary = await prisma.category.findFirstOrThrow({
      where: { userId: account.id, name: 'Sueldo o Salario' },
    });
    await prisma.transaction.create({
      data: {
        userId: account.id,
        date: new Date('2026-03-01T00:00:00.000Z'),
        type: 'INCOME',
        categoryId: salary.id,
        amount: '1500.00',
        currency: 'PEN',
        // Corregida después de importarla: sigue siendo la misma fila.
        description: 'Beca de marzo (corregida)',
        source: 'IMPORT',
        importKey: importKeyOf(row?.fingerprint ?? ''),
      },
    });

    await expect(previewed(`${file}\n${line}`)).resolves.toMatchObject({
      alreadyImported: [2],
      transactions: 1,
    });
  });

  it('refuses, in the table itself, the same import key twice in an account', async () => {
    const account = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
    const salary = await prisma.category.findFirstOrThrow({
      where: { userId: account.id, name: 'Sueldo o Salario' },
    });
    const data = {
      userId: account.id,
      date: new Date('2026-03-01T00:00:00.000Z'),
      type: 'INCOME' as const,
      categoryId: salary.id,
      amount: '1.00',
      currency: 'PEN' as const,
      description: 'A',
      source: 'IMPORT' as const,
      importKey: 'misma-huella',
    };
    await prisma.transaction.create({ data });

    await expect(prisma.transaction.create({ data })).rejects.toThrow();
  });

  // El límite anterior de Express era 100 KB: una hoja de años lo pasa de sobra.
  it('accepts a file far larger than 100 KB', async () => {
    const rows = Array.from(
      { length: 3000 },
      (_, index) =>
        `2026-03-01,Ingreso,Sueldo o Salario,,1.00,PEN,Fila ${String(index)} con una descripción larga,,,,,`,
    );

    const result = await previewed([HEADER, ...rows].join('\n'));

    expect(result).toMatchObject({ rows: 3000, transactions: 3000 });
  });

  describe('rejects the whole file', () => {
    it('with 413 when it weighs more than 1 MB', async () => {
      const response = await preview(`${HEADER}\n${'x'.repeat(1_100_000)}`).expect(413);

      expect(codeOf(response)).toBe(problemType('IMPORT_FILE_TOO_LARGE'));
    });

    it('with 413 when it has more than 5 000 rows', async () => {
      const rows = Array.from({ length: 5001 }, () => '2026-03-01,Ingreso,X,,1.00,PEN,A,,,,,');

      const response = await preview([HEADER, ...rows].join('\n')).expect(413);

      expect(codeOf(response)).toBe(problemType('IMPORT_TOO_MANY_ROWS'));
    });

    it('with 413 when the request itself is larger than the limit of the API', async () => {
      const response = await preview('x'.repeat(2_200_000)).expect(413);

      expect(codeOf(response)).toBe(problemType('PAYLOAD_TOO_LARGE'));
    });

    // Antes respondía 500: el parser lanza un error que el filtro no reconocía.
    it('with 400 when the body is not valid JSON', async () => {
      const response = await request(server)
        .post(PREVIEW)
        .set('Authorization', `Bearer ${ana}`)
        .set('Content-Type', 'application/json')
        .send('{"csv": "sin cerrar')
        .expect(400);

      expect(codeOf(response)).toBe(problemType('BAD_REQUEST'));
    });

    it.each([
      ['a malformed CSV', `${HEADER}\n"sin cerrar`, 'MALFORMED_CSV'],
      ['a missing required column', 'fecha,tipo\n2026-03-01,Ingreso', 'IMPORT_COLUMNS_MISSING'],
    ])('with 422 for %s', async (_case, csv, code) => {
      const response = await preview(csv).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
    });

    it('with 422 when the body is not the expected shape', async () => {
      const response = await request(server)
        .post(PREVIEW)
        .set('Authorization', `Bearer ${ana}`)
        .send({ file: SHEET })
        .expect(422);

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });
  });

  describe('never mixes accounts', () => {
    it('does not see the payment methods of another account', async () => {
      const result = await previewed(
        `${HEADER}\n2026-03-01,Ingreso,Sueldo o Salario,,1.00,PEN,A,BCP Digital Soles,,,,`,
        bruno,
      );

      expect(result.paymentMethods).toEqual([
        { alias: 'BCP Digital Soles', status: 'missing', lines: [2] },
      ]);
    });

    it('does not take the imports of another account as its own', async () => {
      const line = '2026-03-01,Ingreso,Sueldo o Salario,,1500.00,PEN,Beca,,,,,';
      const file = `${HEADER}\n${line}`;
      const [row] = readImportFile(file, LocalDate.of(2026, 9, 28)).rows;
      const other = await prisma.user.findUniqueOrThrow({ where: { email: BRUNO.email } });
      const salary = await prisma.category.findFirstOrThrow({
        where: { userId: other.id, name: 'Sueldo o Salario' },
      });
      await prisma.transaction.create({
        data: {
          userId: other.id,
          date: new Date('2026-03-01T00:00:00.000Z'),
          type: 'INCOME',
          categoryId: salary.id,
          amount: '1500.00',
          currency: 'PEN',
          description: 'Beca',
          source: 'IMPORT',
          importKey: importKeyOf(row?.fingerprint ?? ''),
        },
      });

      await expect(previewed(file)).resolves.toMatchObject({
        alreadyImported: [],
        transactions: 1,
      });
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      await request(server).post(PREVIEW).send({ csv: SHEET }).expect(401);
    });

    it('refuses a personal access token', async () => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await request(server)
        .post(PREVIEW)
        .set('Authorization', `Bearer ${token}`)
        .send({ csv: SHEET })
        .expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while transactions is off', async () => {
      process.env.FEATURE_TRANSACTIONS = 'false';

      await preview(SHEET).expect(404);
    });
  });
});
