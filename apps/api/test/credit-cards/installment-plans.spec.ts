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
const METHODS = `/${API_PREFIX}/payment-methods`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const CARDS = `/${API_PREFIX}/credit-cards`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const MISSING = '01999999-9999-7999-8999-000000000001';
// Hoy es 2026-09-29 en Lima. Corte 20: ciclo en curso del 21/09 al 20/10.
const NOW = new Date('2026-09-29T17:00:00.000Z');

interface PlanBody {
  id: string;
  transactionId: string;
  count: number;
  state: string;
  purchase: { date: string; description: string; amount: { amount: string } } | null;
  total: { amount: string; currency: string } | null;
  interest: { amount: string } | null;
  installments: {
    number: number;
    amount: { amount: string };
    statementDate: string;
    billed: boolean;
  }[];
  pending: { count: number; amount: { amount: string } } | null;
}

interface StatusBody {
  status: {
    currencies: { debt: string; cycleCharges: string; pendingInstallments: string }[];
    statement: { balances: { balance: string }[] } | null;
  };
}

describe('installment plans', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let visa: string;
  let card: string;
  let appliances: string;
  let tv: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_TRANSACTIONS = 'true';
    process.env.FEATURE_CREDIT_CARDS = 'true';
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
    process.env.FEATURE_CREDIT_CARDS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    ({ visa, card, appliances } = await owner(ana));
    tv = await buy(ana, visa, appliances, '1200.00');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.FEATURE_CREDIT_CARDS;
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

  /** Una cuenta con su Visa configurada (corte 20, pago a 25 días) y una categoría de gasto. */
  async function owner(session: string) {
    const method = await create(session, METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Visa',
      institution: 'BCP',
      last4: '4321',
    });
    const configured = await create(session, CARDS, {
      paymentMethodId: method,
      creditLimit: { amount: '5000.00', currency: 'PEN' },
      statementDay: 20,
      paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    });
    const category = await create(session, CATEGORIES, {
      name: 'Electrodomésticos',
      type: 'VARIABLE_EXPENSE',
      color: '#1E88E5',
      icon: 'tv',
    });

    return { visa: method, card: configured, appliances: category };
  }

  function buy(
    session: string,
    method: string,
    category: string,
    amount: string,
    date = '2026-09-10',
  ) {
    return create(session, TRANSACTIONS, {
      date,
      type: 'VARIABLE_EXPENSE',
      categoryId: category,
      amount,
      currency: 'PEN',
      description: 'Televisor',
      paymentMethodId: method,
    });
  }

  function install(body: object, cardId = card, session = ana): request.Test {
    return request(server)
      .post(`${CARDS}/${cardId}/installments`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  async function plans(cardId = card, session = ana): Promise<PlanBody[]> {
    const response = await request(server)
      .get(`${CARDS}/${cardId}/installments`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as PlanBody[];
  }

  async function statusOf(): Promise<StatusBody['status']> {
    const response = await request(server)
      .get(`${CARDS}/${card}/status`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    return (response.body as StatusBody).status;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  it('splits the purchase, bills one installment per statement and shows what is left', async () => {
    const response = await install({ transactionId: tv, count: 3, totalAmount: '1260.00' }).expect(
      201,
    );

    expect(response.body).toEqual({
      id: expect.any(String) as string,
      transactionId: tv,
      count: 3,
      state: 'ACTIVE',
      purchase: {
        date: '2026-09-10',
        description: 'Televisor',
        amount: { amount: '1200.00', currency: 'PEN' },
      },
      total: { amount: '1260.00', currency: 'PEN' },
      interest: { amount: '60.00', currency: 'PEN' },
      installments: [
        {
          number: 1,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-09-20',
          billed: true,
        },
        {
          number: 2,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-10-20',
          billed: false,
        },
        {
          number: 3,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-11-20',
          billed: false,
        },
      ],
      pending: { count: 2, amount: { amount: '840.00', currency: 'PEN' } },
    });
    await expect(plans()).resolves.toHaveLength(1);
  });

  it('changes the status of the card: the interest is debt, the statement only the installment billed', async () => {
    await install({ transactionId: tv, count: 3, totalAmount: '1260.00' }).expect(201);

    const status = await statusOf();

    expect(status.currencies[0]).toEqual({
      currency: 'PEN',
      debt: '1260.00',
      cycleCharges: '420.00',
      pendingInstallments: '840.00',
    });
    expect(status.statement?.balances[0]?.balance).toBe('420.00');
  });

  it('never changes what the purchase costs in the transactions', async () => {
    await install({ transactionId: tv, count: 3, totalAmount: '1260.00' }).expect(201);

    const response = await request(server)
      .get(`${TRANSACTIONS}/${tv}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    expect(response.body).toMatchObject({ amount: '1200.00' });
  });

  describe('following the purchase', () => {
    it('takes the corrected amount without interest', async () => {
      await install({ transactionId: tv, count: 2 }).expect(201);
      await request(server)
        .patch(`${TRANSACTIONS}/${tv}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ amount: '1000.00' })
        .expect(200);

      const [plan] = await plans();

      expect(plan?.installments.map((item) => item.amount.amount)).toEqual(['500.00', '500.00']);
    });

    it('is ignored while the purchase is deleted and comes back when it is restored', async () => {
      await install({ transactionId: tv, count: 3 }).expect(201);
      await request(server)
        .delete(`${TRANSACTIONS}/${tv}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);
      const [deleted] = await plans();
      const whileDeleted = await statusOf();
      await request(server)
        .post(`${TRANSACTIONS}/${tv}/restore`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);
      const [restored] = await plans();

      expect(deleted).toMatchObject({
        state: 'PURCHASE_DELETED',
        purchase: null,
        installments: [],
      });
      expect(whileDeleted.currencies[0]?.debt).toBe('0.00');
      expect(restored?.state).toBe('ACTIVE');
    });

    it('is not valid once the purchase goes above the bank total', async () => {
      await install({ transactionId: tv, count: 3, totalAmount: '1260.00' }).expect(201);
      await request(server)
        .patch(`${TRANSACTIONS}/${tv}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ amount: '1300.00' })
        .expect(200);

      const [plan] = await plans();
      const status = await statusOf();

      expect(plan?.state).toBe('TOTAL_BELOW_PRICE');
      expect(status.currencies[0]?.pendingInstallments).toBe('0.00');
      expect(status.currencies[0]?.debt).toBe('1300.00');
    });
  });

  it('undoes a plan, and the purchase is billed whole again', async () => {
    const created = await install({ transactionId: tv, count: 3 }).expect(201);

    await request(server)
      .delete(`${CARDS}/${card}/installments/${(created.body as PlanBody).id}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);

    await expect(plans()).resolves.toEqual([]);
    expect((await statusOf()).statement?.balances[0]?.balance).toBe('1200.00');
  });

  it.each([
    ['1 installment', { count: 1 }, 'INSTALLMENT_COUNT_INVALID'],
    [
      'a total below the price',
      { count: 3, totalAmount: '1199.99' },
      'INSTALLMENT_TOTAL_BELOW_PRICE',
    ],
    ['a total with three decimals', { count: 3, totalAmount: '1300.001' }, 'INVALID_AMOUNT'],
  ])('answers 422 for %s', async (_case, extra, code) => {
    const response = await install({ transactionId: tv, ...extra }).expect(422);

    expect(codeOf(response)).toBe(problemType(code));
    await expect(prisma.installmentPlan.count()).resolves.toBe(0);
  });

  it('answers 422 for a purchase with another card', async () => {
    const amex = await create(ana, METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Amex',
      institution: 'Interbank',
      last4: '9876',
    });
    const other = await buy(ana, amex, appliances, '50.00');

    const response = await install({ transactionId: other, count: 3 }).expect(422);

    expect(codeOf(response)).toBe(problemType('INSTALLMENT_PURCHASE_NOT_ON_CARD'));
  });

  it('answers 409 for a second plan of the same purchase', async () => {
    await install({ transactionId: tv, count: 3 }).expect(201);

    const response = await install({ transactionId: tv, count: 6 }).expect(409);

    expect(codeOf(response)).toBe(problemType('INSTALLMENT_PLAN_ALREADY_EXISTS'));
  });

  it('refuses a body with a userId or an amount per installment', async () => {
    await install({ transactionId: tv, count: 3, userId: MISSING }).expect(422);
    await install({ transactionId: tv, count: 3, amount: '400.00' }).expect(422);
  });

  describe('user isolation (anti-IDOR)', () => {
    it('answers 404 when marking the purchase of another account', async () => {
      const hers = await owner(bruno);
      const herTv = await buy(bruno, hers.visa, hers.appliances, '800.00');

      const response = await install({ transactionId: herTv, count: 3 }).expect(404);

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
      await expect(prisma.installmentPlan.count()).resolves.toBe(0);
    });

    it('answers 404 for every route of the card of another account', async () => {
      const created = await install({ transactionId: tv, count: 3 }).expect(201);
      const planId = (created.body as PlanBody).id;

      const listed = await request(server)
        .get(`${CARDS}/${card}/installments`)
        .set('Authorization', `Bearer ${bruno}`)
        .expect(404);
      const marked = await install({ transactionId: tv, count: 6 }, card, bruno).expect(404);
      const undone = await request(server)
        .delete(`${CARDS}/${card}/installments/${planId}`)
        .set('Authorization', `Bearer ${bruno}`)
        .expect(404);

      expect([codeOf(listed), codeOf(marked), codeOf(undone)]).toEqual([
        problemType('CREDIT_CARD_NOT_FOUND'),
        problemType('CREDIT_CARD_NOT_FOUND'),
        problemType('INSTALLMENT_PLAN_NOT_FOUND'),
      ]);
      await expect(plans()).resolves.toHaveLength(1);
    });

    it('answers 404 when undoing a plan through another card of the same account', async () => {
      const created = await install({ transactionId: tv, count: 3 }).expect(201);
      const amex = await create(ana, METHODS, {
        kind: 'CREDIT_CARD',
        alias: 'Amex',
        institution: 'Interbank',
        last4: '9876',
      });
      const amexCard = await create(ana, CARDS, {
        paymentMethodId: amex,
        creditLimit: { amount: '100.00', currency: 'PEN' },
        statementDay: 5,
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 25 },
      });

      await request(server)
        .delete(`${CARDS}/${amexCard}/installments/${(created.body as PlanBody).id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(404);
      await expect(plans()).resolves.toHaveLength(1);
    });
  });

  describe('access', () => {
    const routes = [
      ['GET', () => request(server).get(`${CARDS}/${MISSING}/installments`)],
      [
        'POST',
        () =>
          request(server)
            .post(`${CARDS}/${MISSING}/installments`)
            .send({ transactionId: MISSING, count: 3 }),
      ],
      ['DELETE', () => request(server).delete(`${CARDS}/${MISSING}/installments/${MISSING}`)],
    ] as const;

    it.each(routes)('%s requires a session', async (_method, send) => {
      await send().expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it.each(routes)('%s refuses a personal access token', async (_method, send) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await send().set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(routes)('%s answers 404 while the credit cards are off', async (_method, send) => {
      process.env.FEATURE_CREDIT_CARDS = 'false';

      await send().set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
