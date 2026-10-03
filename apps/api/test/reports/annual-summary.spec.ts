import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FixedClock } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const ANNUAL = `/${API_PREFIX}/reports/annual`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
// Hoy es 3 de octubre de 2026 en Lima: noviembre y diciembre todavía no llegan.
const NOW = new Date('2026-10-03T17:00:00.000Z');
const FLAGS = ['FEATURE_IDENTITY', 'FEATURE_CATALOG', 'FEATURE_TRANSACTIONS', 'FEATURE_REPORTS'];

interface AnnualBody {
  year: number;
  currencies: {
    currency: string;
    rows: { row: string; months: (string | null)[]; total: string }[];
    savingsRate: string | null;
    distribution: { categoryId: string | null; amount: string; share: string | null }[];
  }[];
}

interface Account {
  session: string;
  payroll: string;
  groceries: string;
  delivery: string;
}

describe('annual summary', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: Account;
  let bruno: Account;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    for (const flag of FLAGS) process.env[flag] = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = TOTP_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(FixedClock.at(NOW))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    for (const flag of FLAGS) process.env[flag] = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await accountOf(ANA);
    bruno = await accountOf(BRUNO);
    await record(ana, ana.payroll, 'INCOME', '2026-01-01', '3000.00');
    await record(ana, ana.groceries, 'VARIABLE_EXPENSE', '2026-09-05', '60.00');
    await record(ana, ana.delivery, 'VARIABLE_EXPENSE', '2026-09-30', '50.00');
    await record(ana, ana.groceries, 'VARIABLE_EXPENSE', '2025-12-31', '20.00');
    // Lo de Bruno, con los mismos nombres: nada de esto puede sumar a Ana.
    await record(bruno, bruno.groceries, 'VARIABLE_EXPENSE', '2026-09-05', '999.00');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    for (const flag of FLAGS) Reflect.deleteProperty(process.env, flag);
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function create(session: string, path: string, body: object): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  /** Una cuenta con sus categorías (nombres fuera de la semilla, o darían 409). */
  async function accountOf(credentials: typeof ANA): Promise<Account> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);
    const session = (response.body as { accessToken: string }).accessToken;
    const category = (body: object) =>
      create(session, CATEGORIES, { color: '#1E88E5', icon: 'tag', ...body });
    const payroll = await category({ name: 'Planilla', type: 'INCOME' });
    const groceries = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' });
    const delivery = await category({
      name: 'Delivery',
      type: 'VARIABLE_EXPENSE',
      parentId: groceries,
    });

    return { session, payroll, groceries, delivery };
  }

  function record(
    account: Account,
    categoryId: string,
    type: string,
    date: string,
    amount: string,
  ): Promise<string> {
    return create(account.session, TRANSACTIONS, {
      date,
      type,
      categoryId,
      amount,
      currency: 'PEN',
      description: 'Movimiento',
    });
  }

  async function annualOf(year: number, session = ana.session): Promise<AnnualBody> {
    const response = await request(server)
      .get(`${ANNUAL}?year=${String(year)}`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as AnnualBody;
  }

  function rowOf(body: AnnualBody, row: string) {
    return body.currencies[0]?.rows.find((entry) => entry.row === row);
  }

  it('lays the year in course out month by month, with the months to come empty', async () => {
    const body = await annualOf(2026);

    expect(body.currencies.map((entry) => entry.currency)).toEqual(['PEN']);
    expect(rowOf(body, 'INCOME')).toEqual({
      row: 'INCOME',
      months: [
        '3000.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        null,
        null,
      ],
      total: '3000.00',
    });
    // La subcategoría suma en su madre, y lo de Bruno no suma.
    expect(rowOf(body, 'VARIABLE_EXPENSE')?.months[8]).toBe('110.00');
    expect(rowOf(body, 'EXPENSE')?.total).toBe('110.00');
    expect(rowOf(body, 'BALANCE')?.total).toBe('2890.00');
    expect(body.currencies[0]?.savingsRate).toBe('0');
    expect(body.currencies[0]?.distribution).toEqual([
      { categoryId: ana.groceries, amount: '110.00', share: '100' },
    ]);
    expect(body.currencies[0]?.rows.map((entry) => entry.row)).toEqual([
      'INCOME',
      'FIXED_EXPENSE',
      'VARIABLE_EXPENSE',
      'EXPENSE',
      'SAVING',
      'INVESTMENT',
      'DEBT',
      'BALANCE',
    ]);
  });

  it('closes a past year whole, December in its column, with no savings rate without income', async () => {
    const body = await annualOf(2025);

    expect(rowOf(body, 'VARIABLE_EXPENSE')?.months).toEqual([
      ...Array.from({ length: 11 }, () => '0.00'),
      '20.00',
    ]);
    expect(body.currencies[0]?.savingsRate).toBeNull();
  });

  it('shows another account only its own', async () => {
    const body = await annualOf(2026, bruno.session);

    expect(rowOf(body, 'VARIABLE_EXPENSE')?.total).toBe('999.00');
    expect(rowOf(body, 'INCOME')?.total).toBe('0.00');
    expect((await annualOf(2025, bruno.session)).currencies).toEqual([]);
  });

  it('answers an empty year with no currencies, not an error', async () => {
    await expect(annualOf(2024)).resolves.toEqual({ year: 2024, currencies: [] });
  });

  it.each([
    ['2027', 'SUMMARY_YEAR_IN_FUTURE'],
    ['1999', 'SUMMARY_YEAR_INVALID'],
    ['26', 'VALIDATION_FAILED'],
  ])('refuses the year %s with 422', async (year, code) => {
    const response = await request(server)
      .get(`${ANNUAL}?year=${year}`)
      .set('Authorization', `Bearer ${ana.session}`)
      .expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType(code));
  });

  describe('access', () => {
    const send = () => request(server).get(`${ANNUAL}?year=2026`);

    it('requires a session', async () => {
      await send().expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it('refuses a personal access token', async () => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana.session}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);

      await send()
        .set('Authorization', `Bearer ${(created.body as { token: string }).token}`)
        .expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while the reports are off', async () => {
      process.env.FEATURE_REPORTS = 'false';

      await send().set('Authorization', `Bearer ${ana.session}`).expect(404);
    });
  });
});
