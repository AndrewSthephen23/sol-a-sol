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
const METHODS = `/${API_PREFIX}/payment-methods`;
const CARDS = `/${API_PREFIX}/credit-cards`;
const GOALS = `/${API_PREFIX}/goals`;
const SUMMARY = `/${API_PREFIX}/reports/monthly-summary`;
const SEPTEMBER = `${SUMMARY}?year=2026&month=9`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
// Hoy es 3 de octubre de 2026 en Lima: setiembre ya cerró.
const NOW = new Date('2026-10-03T17:00:00.000Z');
const FLAGS = [
  'FEATURE_IDENTITY',
  'FEATURE_CATALOG',
  'FEATURE_TRANSACTIONS',
  'FEATURE_BUDGETING',
  'FEATURE_CREDIT_CARDS',
  'FEATURE_GOALS',
  'FEATURE_REPORTS',
];

interface SummaryBody {
  year: number;
  month: number;
  period: { from: string; to: string; complete: boolean };
  previousPeriod: { from: string; to: string };
  currencies: {
    currency: string;
    totals: Record<string, string>;
    savingsRate: string | null;
    byType: { type: string; amount: string; previous: string; change: string | null }[];
    byCategory: { categoryId: string; amount: string; previous: string; change: string | null }[];
    topCategories: { categoryId: string; amount: string; share: string | null }[];
    topMerchants: { merchant: string; amount: string; count: number }[];
  }[];
  budget?: { status: string; exceeded?: { categoryId: string; difference: string }[] };
  cards?: {
    alias: string;
    charges: { amount: string; currency: string }[];
    statement: {
      closingDate: string;
      dueDate: string;
      balances: { balance: string; remaining: string }[];
    } | null;
  }[];
  goals?: { name: string; contributed: string; saved: string; status: string }[];
}

/** Lo que cada cuenta registra: los mismos nombres en las dos, para que nada se cruce. */
interface Account {
  session: string;
  groceries: string;
  delivery: string;
  visa: string;
}

describe('monthly summary', () => {
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
    ana = await seed(await sessionOf(ANA));
    bruno = await seed(await sessionOf(BRUNO));
    await spend(ana, ana.groceries, '2026-09-05', '60.00', 'Tambo');
    await spend(ana, ana.delivery, '2026-09-10', '50.00', 'TAMBO ', ana.visa);
    // Lo de Bruno, con los mismos nombres, comercio y alias: nada de esto puede sumar a Ana.
    await spend(bruno, bruno.groceries, '2026-09-08', '999.00', 'Tambo');
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

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function create(session: string, path: string, body: object): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function categoryOf(session: string, body: object): Promise<string> {
    return create(session, CATEGORIES, { color: '#1E88E5', icon: 'tag', ...body });
  }

  /**
   * Una cuenta con un mes de setiembre completo: sueldo, víveres (con una subcategoría), ahorro,
   * su Visa (corte 20, pago a 25 días), un presupuesto de víveres y una meta con un aporte.
   */
  async function seed(session: string): Promise<Account> {
    // Nombres fuera de la semilla de categorías, o darían 409.
    const payroll = await categoryOf(session, { name: 'Planilla', type: 'INCOME' });
    const groceries = await categoryOf(session, { name: 'Víveres', type: 'VARIABLE_EXPENSE' });
    const delivery = await categoryOf(session, {
      name: 'Delivery',
      type: 'VARIABLE_EXPENSE',
      parentId: groceries,
    });
    const mattress = await categoryOf(session, { name: 'Colchón', type: 'SAVING' });

    await create(session, TRANSACTIONS, {
      date: '2026-09-01',
      type: 'INCOME',
      categoryId: payroll,
      amount: '3000.00',
      currency: 'PEN',
      description: 'Sueldo',
    });
    await create(session, TRANSACTIONS, {
      date: '2026-09-02',
      type: 'SAVING',
      categoryId: mattress,
      amount: '500.00',
      currency: 'PEN',
      description: 'Ahorro',
    });
    const visa = await create(session, METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Visa',
      institution: 'BCP',
      last4: '4321',
    });
    await create(session, CARDS, {
      paymentMethodId: visa,
      creditLimit: { amount: '5000.00', currency: 'PEN' },
      statementDay: 20,
      paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    });
    const account = { session, groceries, delivery, visa };
    await spend(account, groceries, '2026-08-20', '40.00');

    await request(server)
      .put(`/${API_PREFIX}/budgets/2026/9`)
      .set('Authorization', `Bearer ${session}`)
      .send({ lines: [{ categoryId: groceries, plannedAmount: '100.00', currency: 'PEN' }] })
      .expect(200);
    const trip = await create(session, GOALS, {
      name: 'Viaje',
      currency: 'PEN',
      targetAmount: '1200.00',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    await create(session, `${GOALS}/${trip}/contributions`, {
      source: 'MANUAL',
      kind: 'CONTRIBUTION',
      amount: '300.00',
      date: '2026-09-15',
    });

    return account;
  }

  function spend(
    account: Account,
    categoryId: string,
    date: string,
    amount: string,
    merchant?: string,
    paymentMethodId?: string,
  ): Promise<string> {
    return create(account.session, TRANSACTIONS, {
      date,
      type: 'VARIABLE_EXPENSE',
      categoryId,
      amount,
      currency: 'PEN',
      description: 'Compra',
      ...(merchant === undefined ? {} : { merchant }),
      ...(paymentMethodId === undefined ? {} : { paymentMethodId }),
    });
  }

  async function summaryOf(path = SEPTEMBER, session = ana.session): Promise<SummaryBody> {
    const response = await request(server)
      .get(path)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as SummaryBody;
  }

  it('closes September with its own movements only, against the whole of August', async () => {
    const summary = await summaryOf();
    const [soles] = summary.currencies;

    expect(summary.period).toEqual({ from: '2026-09-01', to: '2026-09-30', complete: true });
    expect(summary.previousPeriod).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(soles?.totals).toEqual({
      income: '3000.00',
      expense: '110.00',
      saving: '500.00',
      debt: '0.00',
      balance: '2390.00',
    });
    expect(soles?.savingsRate).toMatch(/^16\.666666/u);
    // La subcategoría suma en su madre: S/ 110.00 contra S/ 40.00 de agosto.
    expect(soles?.byCategory.find((row) => row.categoryId === ana.groceries)).toMatchObject({
      amount: '110.00',
      previous: '40.00',
      change: '175',
    });
    expect(soles?.byCategory.some((row) => row.categoryId === ana.delivery)).toBe(false);
    // «Tambo» y «TAMBO » son el mismo comercio; Bruno también compró en uno, y no suma.
    expect(soles?.topMerchants).toEqual([{ merchant: 'TAMBO', amount: '110.00', count: 2 }]);
  });

  it('joins the budget, the card and the goal of the account, as of the cutoff', async () => {
    const summary = await summaryOf();

    expect(summary.budget).toMatchObject({
      status: 'SET',
      exceeded: [{ categoryId: ana.groceries, difference: '-10.00' }],
    });
    expect(summary.cards).toEqual([
      {
        id: expect.any(String) as string,
        alias: 'Visa',
        institution: 'BCP',
        last4: '4321',
        charges: [{ amount: '50.00', currency: 'PEN' }],
        statement: {
          closingDate: '2026-09-20',
          dueDate: '2026-10-15',
          balances: [{ currency: 'PEN', balance: '50.00', remaining: '50.00' }],
        },
      },
    ]);
    expect(summary.goals).toMatchObject([
      { name: 'Viaje', currency: 'PEN', contributed: '300.00', saved: '300.00' },
    ]);
  });

  it('shows another account only its own sections', async () => {
    const summary = await summaryOf(SEPTEMBER, bruno.session);

    expect(summary.currencies[0]?.topMerchants).toEqual([
      { merchant: 'Tambo', amount: '999.00', count: 1 },
    ]);
    expect(summary.cards?.[0]?.charges).toEqual([]);
    expect(summary.budget).toMatchObject({
      status: 'SET',
      exceeded: [{ categoryId: bruno.groceries, difference: '-899.00' }],
    });
  });

  it('measures the month in course up to today, against the previous one up to the same day', async () => {
    const summary = await summaryOf(`${SUMMARY}?year=2026&month=10`);

    expect(summary.period).toEqual({ from: '2026-10-01', to: '2026-10-03', complete: false });
    expect(summary.previousPeriod).toEqual({ from: '2026-09-01', to: '2026-09-03' });
    // Del 1 al 3 de setiembre: el sueldo y el ahorro.
    expect(summary.currencies[0]?.byType.find((row) => row.type === 'INCOME')).toMatchObject({
      amount: '0.00',
      previous: '3000.00',
      change: '-100',
    });
    expect(summary.budget).toEqual({ status: 'NONE' });
  });

  it('refuses a month that has not started, with 422', async () => {
    const response = await request(server)
      .get(`${SUMMARY}?year=2026&month=11`)
      .set('Authorization', `Bearer ${ana.session}`)
      .expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType('SUMMARY_MONTH_IN_FUTURE'));
  });

  it.each(['?year=2026&month=13', '?year=2026', '?year=2026&month=sep'])(
    'refuses %s with 422',
    async (query) => {
      await request(server)
        .get(`${SUMMARY}${query}`)
        .set('Authorization', `Bearer ${ana.session}`)
        .expect(422);
    },
  );

  it.each([
    ['FEATURE_BUDGETING', 'budget'],
    ['FEATURE_CREDIT_CARDS', 'cards'],
    ['FEATURE_GOALS', 'goals'],
  ])('leaves the section out while %s is off', async (flag, section) => {
    process.env[flag] = 'false';

    const summary = await summaryOf();

    expect(summary).not.toHaveProperty(section);
    expect(summary.currencies).toHaveLength(1);
  });

  describe('access', () => {
    const send = () => request(server).get(SEPTEMBER);

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
      const { token } = created.body as { token: string };

      await send().set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while the reports are off', async () => {
      process.env.FEATURE_REPORTS = 'false';

      await send().set('Authorization', `Bearer ${ana.session}`).expect(404);
    });
  });
});
