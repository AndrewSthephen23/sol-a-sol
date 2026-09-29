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
const CATEGORIES = `/${API_PREFIX}/categories`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const TRANSFERS = `/${API_PREFIX}/transfers`;
/** Un mes ya completo: la prueba no depende del día en que corra. */
const AUGUST = `/${API_PREFIX}/reports/monthly?year=2026&month=8`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface CurrencyBody {
  currency: string;
  kpis: Record<string, string>;
  daily: { date: string; amount: string }[];
  distribution: { categoryId: string | null; amount: string; share: string | null }[];
  byType: { type: string; total: string; categories: { categoryId: string; amount: string }[] }[];
}

interface ReportBody {
  year: number;
  month: number;
  currencies: CurrencyBody[];
}

describe('monthly report', () => {
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
    process.env.FEATURE_REPORTS = 'true';
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
    process.env.FEATURE_REPORTS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.FEATURE_REPORTS;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function category(body: object, session = ana): Promise<string> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send({ color: '#1E88E5', icon: 'tag', ...body })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function record(
    type: string,
    categoryId: string,
    amount: string,
    date = '2026-08-10',
    session = ana,
  ): Promise<string> {
    const response = await request(server)
      .post(TRANSACTIONS)
      .set('Authorization', `Bearer ${session}`)
      .send({ date, type, categoryId, amount, currency: 'PEN', description: 'Movimiento' })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function report(session = ana, path = AUGUST): Promise<ReportBody> {
    const response = await request(server)
      .get(path)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as ReportBody;
  }

  it('has nothing to show for a month without movements', async () => {
    await expect(report()).resolves.toEqual({ year: 2026, month: 8, currencies: [] });
  });

  it('builds the whole dashboard of the month in one call', async () => {
    const wages = await category({ name: 'Honorarios', type: 'INCOME' });
    const groceries = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' });
    const delivery = await category({ name: 'A domicilio', parentId: groceries });
    const movies = await category({ name: 'Películas', type: 'VARIABLE_EXPENSE' });
    const fund = await category({ name: 'Fondo', type: 'SAVING' });
    await record('INCOME', wages, '4000.00', '2026-08-01');
    await record('VARIABLE_EXPENSE', groceries, '100.00', '2026-08-01');
    await record('VARIABLE_EXPENSE', delivery, '50.40', '2026-08-15');
    await record('VARIABLE_EXPENSE', movies, '30.00', '2026-08-31');
    await record('SAVING', fund, '500.00', '2026-08-02');

    const [pen] = (await report()).currencies;

    expect(pen?.kpis).toEqual({
      income: '4000.00',
      expense: '180.40',
      saving: '500.00',
      debt: '0.00',
      balance: '3319.60',
    });
    expect(pen?.daily).toHaveLength(31);
    expect(pen?.daily[0]).toEqual({ date: '2026-08-01', amount: '100.00' });
    expect(pen?.daily[1]).toEqual({ date: '2026-08-02', amount: '0.00' });
    expect(pen?.daily[14]).toEqual({ date: '2026-08-15', amount: '50.40' });
    expect(pen?.daily[30]).toEqual({ date: '2026-08-31', amount: '30.00' });
    expect(pen?.distribution.map((slice) => [slice.categoryId, slice.amount])).toEqual([
      [groceries, '150.40'],
      [movies, '30.00'],
    ]);
    expect(pen?.byType.map((table) => [table.type, table.total])).toEqual([
      ['INCOME', '4000.00'],
      ['VARIABLE_EXPENSE', '180.40'],
      ['SAVING', '500.00'],
    ]);
  });

  it('counts neither deleted transactions nor transfers nor other months', async () => {
    const groceries = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' });
    await record('VARIABLE_EXPENSE', groceries, '10.00');
    await record('VARIABLE_EXPENSE', groceries, '999.00', '2026-07-31');
    const deleted = await record('VARIABLE_EXPENSE', groceries, '500.00');
    await request(server)
      .delete(`${TRANSACTIONS}/${deleted}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);
    const accounts = await Promise.all(
      ['Sueldo BCP', 'Ahorros BCP'].map(async (alias) => {
        const created = await request(server)
          .post(METHODS)
          .set('Authorization', `Bearer ${ana}`)
          .send({ kind: 'ACCOUNT', alias, currency: 'PEN' })
          .expect(201);

        return (created.body as { id: string }).id;
      }),
    );
    await request(server)
      .post(TRANSFERS)
      .set('Authorization', `Bearer ${ana}`)
      .send({
        date: '2026-08-12',
        fromPaymentMethodId: accounts[0],
        toPaymentMethodId: accounts[1],
        amount: '300.00',
        description: 'Ahorro',
      })
      .expect(201);

    const [pen] = (await report()).currencies;

    expect(pen?.kpis.expense).toBe('10.00');
    expect(pen?.daily.reduce((sum, day) => sum + Number(day.amount), 0)).toBe(10);
  });

  it('never shows what another account spent', async () => {
    const hers = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' }, bruno);
    await record('VARIABLE_EXPENSE', hers, '700.00', '2026-08-10', bruno);

    await expect(report()).resolves.toEqual({ year: 2026, month: 8, currencies: [] });
  });

  it.each([
    ['a month that does not exist', 'year=2026&month=13', 'INVALID_LOCAL_DATE'],
    ['a missing month', 'year=2026', 'VALIDATION_FAILED'],
  ])('refuses %s with 422', async (_case, query, code) => {
    const response = await request(server)
      .get(`/${API_PREFIX}/reports/monthly?${query}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType(code));
  });

  describe('access', () => {
    it('requires a session', async () => {
      await request(server).get(AUGUST).expect(401);
    });

    it('refuses a personal access token', async () => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await request(server).get(AUGUST).set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while the reports are off', async () => {
      process.env.FEATURE_REPORTS = 'false';

      await request(server).get(AUGUST).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
