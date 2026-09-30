import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FixedClock, LocalDate } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { TransactionsLookup } from '../../src/modules/transactions/index.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const TRANSFERS = `/${API_PREFIX}/transfers`;
const CARDS = `/${API_PREFIX}/credit-cards`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const MISSING = '01999999-9999-7999-8999-000000000001';
// Hoy es 2026-09-29 en Lima. Con corte 20, el ciclo en curso va del 21/09 al 20/10 y el último
// estado cerrado (del 21/08 al 20/09) vence el 15/10, 25 días después del corte.
const NOW = new Date('2026-09-29T17:00:00.000Z');

interface StatusBody {
  id: string;
  paymentMethod: { id: string; alias: string };
  status: {
    cycle: { start: string; end: string };
    currencies: { currency: string; debt: string; cycleCharges: string }[];
    statement: {
      start: string;
      end: string;
      dueDate: string;
      daysLeft: number;
      paid: boolean;
      balances: { currency: string; balance: string; credited: string; remaining: string }[];
    } | null;
    utilization: { percentage: string | null; level: string | null };
    paymentAlert: { status: string; daysLeft: number } | null;
  };
}

describe('credit card status', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let visa: string;
  let savings: string;
  let card: string;
  /** Categorías de Ana creadas para estas pruebas (la semilla usa otros nombres). */
  let groceries: string;
  let charges: string;
  let refunds: string;

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
    visa = await create(METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Visa',
      institution: 'BCP',
      last4: '4321',
    });
    savings = await create(METHODS, {
      kind: 'ACCOUNT',
      alias: 'Ahorros',
      institution: 'BCP',
      currency: 'PEN',
    });
    card = await setUp(visa);
    groceries = await category('Mercado Central', 'VARIABLE_EXPENSE');
    charges = await category('Cargos Visa', 'DEBT');
    refunds = await category('Devoluciones Visa', 'INCOME');
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

  async function create(path: string, body: object, session = ana): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function category(name: string, type: string, session = ana): Promise<string> {
    return create(CATEGORIES, { name, type, color: '#1E88E5', icon: 'tag' }, session);
  }

  function setUp(paymentMethodId: string, session = ana): Promise<string> {
    return create(
      CARDS,
      {
        paymentMethodId,
        creditLimit: { amount: '1000.00', currency: 'PEN' },
        statementDay: 20,
        paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
      },
      session,
    );
  }

  function buy(date: string, amount: string, currency = 'PEN', categoryId = groceries) {
    const type =
      categoryId === charges ? 'DEBT' : categoryId === refunds ? 'INCOME' : 'VARIABLE_EXPENSE';

    return create(TRANSACTIONS, {
      date,
      type,
      categoryId,
      amount,
      currency,
      description: 'Con la Visa',
      paymentMethodId: visa,
    });
  }

  function transfer(body: object) {
    return create(TRANSFERS, { description: 'Tarjeta', ...body });
  }

  async function statusOf(id = card, session = ana): Promise<StatusBody> {
    const response = await request(server)
      .get(`${CARDS}/${id}/status`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as StatusBody;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  it('shows a card without movements: nothing owed, paid, no alert', async () => {
    const { status } = await statusOf();

    expect(status).toEqual({
      cycle: { start: '2026-09-21', end: '2026-10-20' },
      currencies: [{ currency: 'PEN', debt: '0.00', cycleCharges: '0.00' }],
      statement: {
        start: '2026-08-21',
        end: '2026-09-20',
        dueDate: '2026-10-15',
        daysLeft: 16,
        paid: true,
        balances: [{ currency: 'PEN', balance: '0.00', credited: '0.00', remaining: '0.00' }],
      },
      utilization: { percentage: '0', level: 'OK' },
      paymentAlert: null,
    });
  });

  it('adds purchases of two cycles, payments in another currency, a refund and a cash advance', async () => {
    await buy('2026-08-25', '100.00');
    // La compra del día de corte entra en el estado que cierra ese día.
    await buy('2026-09-20', '10.00', 'PEN', charges);
    await buy('2026-09-22', '30.00', 'USD');
    await buy('2026-09-23', '5.00', 'PEN', refunds);
    // Paga los dólares desde una cuenta en soles: baja la deuda con lo que **llegó**.
    await transfer({
      date: '2026-09-24',
      fromPaymentMethodId: savings,
      toPaymentMethodId: visa,
      amount: '111.00',
      receivedAmount: '30.00',
      receivedCurrency: 'USD',
    });
    await transfer({
      date: '2026-09-25',
      fromPaymentMethodId: savings,
      toPaymentMethodId: visa,
      amount: '60.00',
    });
    // Saca efectivo con la tarjeta: sube la deuda.
    await transfer({
      date: '2026-09-26',
      fromPaymentMethodId: visa,
      toPaymentMethodId: savings,
      amount: '200.00',
      currency: 'PEN',
    });
    const deleted = await buy('2026-09-10', '999.00');
    await request(server)
      .delete(`${TRANSACTIONS}/${deleted}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);

    const { status } = await statusOf();

    expect(status.currencies).toEqual([
      { currency: 'PEN', debt: '245.00', cycleCharges: '200.00' },
      { currency: 'USD', debt: '0.00', cycleCharges: '30.00' },
    ]);
    expect(status.statement).toMatchObject({
      paid: false,
      balances: [
        { currency: 'PEN', balance: '110.00', credited: '65.00', remaining: '45.00' },
        { currency: 'USD', balance: '0.00', credited: '30.00', remaining: '0.00' },
      ],
    });
    expect(status.utilization).toEqual({ percentage: '24.5', level: 'OK' });
  });

  it('starts from the opening balance, counting only what came after its date', async () => {
    await buy('2026-09-01', '500.00');
    await buy('2026-09-02', '100.00');
    await request(server)
      .patch(`${CARDS}/${card}`)
      .set('Authorization', `Bearer ${ana}`)
      .send({
        openingBalance: { date: '2026-09-01', amounts: [{ amount: '700.00', currency: 'PEN' }] },
      })
      .expect(200);

    const { status } = await statusOf();

    expect(status.currencies[0]?.debt).toBe('800.00');
    expect(status.utilization).toEqual({ percentage: '80', level: 'CRITICAL' });
  });

  it('lists every card with its status', async () => {
    const amex = await create(METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Amex',
      institution: 'Interbank',
      last4: '9876',
    });
    await setUp(amex);

    const response = await request(server)
      .get(`${CARDS}/status`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    expect((response.body as StatusBody[]).map((entry) => entry.paymentMethod.alias)).toEqual([
      'Visa',
      'Amex',
    ]);
  });

  describe('user isolation (anti-IDOR)', () => {
    it('answers 404 for the status of the card of another account', async () => {
      const response = await request(server)
        .get(`${CARDS}/${card}/status`)
        .set('Authorization', `Bearer ${bruno}`)
        .expect(404);

      expect(codeOf(response)).toBe(problemType('CREDIT_CARD_NOT_FOUND'));
    });

    it('never adds what another account bought with a card of the same name', async () => {
      const hers = await create(
        METHODS,
        { kind: 'CREDIT_CARD', alias: 'Visa', institution: 'BCP', last4: '4321' },
        bruno,
      );
      await setUp(hers, bruno);
      const food = await category('Mercado Central', 'VARIABLE_EXPENSE', bruno);
      await create(
        TRANSACTIONS,
        {
          date: '2026-09-10',
          type: 'VARIABLE_EXPENSE',
          categoryId: food,
          amount: '300.00',
          currency: 'PEN',
          description: 'Con su Visa',
          paymentMethodId: hers,
        },
        bruno,
      );

      const { status } = await statusOf();

      expect(status.currencies).toEqual([{ currency: 'PEN', debt: '0.00', cycleCharges: '0.00' }]);
      const everyone = await request(server)
        .get(`${CARDS}/status`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);
      expect(everyone.body).toHaveLength(1);
    });

    it('answers 422 for an id that is not a UUID, and 404 for one that does not exist', async () => {
      await request(server)
        .get(`${CARDS}/visa/status`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);
      await request(server)
        .get(`${CARDS}/${MISSING}/status`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(404);
    });
  });

  describe('what transactions tells a card (TransactionsLookup)', () => {
    it('sums per day and currency, receiving side for payments, and leaves out deleted ones', async () => {
      await buy('2026-09-10', '10.00');
      await buy('2026-09-10', '2.50');
      await transfer({
        date: '2026-09-11',
        fromPaymentMethodId: savings,
        toPaymentMethodId: visa,
        amount: '37.00',
        receivedAmount: '10.00',
        receivedCurrency: 'USD',
      });
      const undone = await transfer({
        date: '2026-09-11',
        fromPaymentMethodId: savings,
        toPaymentMethodId: visa,
        amount: '5.00',
      });
      await request(server)
        .delete(`${TRANSFERS}/${undone}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);
      const anaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } })).id;

      const totals = await app
        .get(TransactionsLookup)
        .paymentMethodTotalsByDay(anaId, visa, LocalDate.parse('2026-09-29'));

      expect(
        totals
          .map((total) => [
            total.date.toString(),
            total.kind,
            total.amount.toFixed(),
            total.amount.currency,
          ])
          .sort(),
      ).toEqual([
        ['2026-09-10', 'VARIABLE_EXPENSE', '12.50', 'PEN'],
        ['2026-09-11', 'TRANSFER_IN', '10.00', 'USD'],
      ]);
    });
  });

  describe('access', () => {
    const paths = [() => `${CARDS}/status`, () => `${CARDS}/${MISSING}/status`];

    it.each(paths)('%s requires a session', async (path) => {
      await request(server).get(path()).expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it.each(paths)('%s refuses a personal access token', async (path) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await request(server).get(path()).set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(paths)('%s answers 404 while the credit cards are off', async (path) => {
      process.env.FEATURE_CREDIT_CARDS = 'false';

      await request(server).get(path()).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
