import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { Money } from '@sol-a-sol/domain';

import {
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../../src/modules/credit-cards/ports/credit-card-repository.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const CARDS = `/${API_PREFIX}/credit-cards`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const MISSING = '01999999-9999-7999-8999-000000000001';

interface CardBody {
  id: string;
  paymentMethod: {
    id: string;
    alias: string;
    institution: string | null;
    last4: string | null;
    currency: string | null;
    archived: boolean;
  };
  creditLimit: { amount: string; currency: string };
  statementDay: number;
  paymentDueRule: { kind: string; days?: number; day?: number };
  openingBalance: { date: string; amounts: { amount: string; currency: string }[] } | null;
}

const SETTINGS = {
  creditLimit: { amount: '5000.00', currency: 'PEN' },
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
};

describe('credit cards', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  /** Métodos de pago de Ana: una tarjeta bimoneda, una en soles y una cuenta. */
  let visa: string;
  let amex: string;
  let savings: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_CREDIT_CARDS = 'true';
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
    process.env.FEATURE_CREDIT_CARDS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    visa = await method({ kind: 'CREDIT_CARD', alias: 'Visa', institution: 'BCP', last4: '4321' });
    amex = await method({
      kind: 'CREDIT_CARD',
      alias: 'Amex',
      institution: 'Interbank',
      last4: '9876',
      currency: 'PEN',
    });
    savings = await method({
      kind: 'ACCOUNT',
      alias: 'Ahorros',
      institution: 'BCP',
      currency: 'PEN',
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
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

  async function method(body: object, session = ana): Promise<string> {
    const response = await request(server)
      .post(METHODS)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function configure(body: object, session = ana): request.Test {
    return request(server).post(CARDS).set('Authorization', `Bearer ${session}`).send(body);
  }

  function correct(id: string, body: object, session = ana): request.Test {
    return request(server)
      .patch(`${CARDS}/${id}`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  async function list(session = ana): Promise<CardBody[]> {
    const response = await request(server)
      .get(CARDS)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as CardBody[];
  }

  async function visaCard(extra: object = {}): Promise<CardBody> {
    const response = await configure({ paymentMethodId: visa, ...SETTINGS, ...extra }).expect(201);

    return response.body as CardBody;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  describe('setting up a card', () => {
    it('saves it and answers with what identifies the card, exact down to the column', async () => {
      const card = await visaCard({
        openingBalance: {
          date: '2026-09-01',
          amounts: [
            { amount: '1200.50', currency: 'PEN' },
            { amount: '80.00', currency: 'USD' },
          ],
        },
      });

      expect(card).toEqual({
        id: expect.any(String) as string,
        paymentMethod: {
          id: visa,
          alias: 'Visa',
          institution: 'BCP',
          last4: '4321',
          currency: null,
          archived: false,
        },
        creditLimit: { amount: '5000.00', currency: 'PEN' },
        statementDay: 20,
        paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
        openingBalance: {
          date: '2026-09-01',
          amounts: [
            { amount: '1200.50', currency: 'PEN' },
            { amount: '80.00', currency: 'USD' },
          ],
        },
      });
      const [row] = await prisma.$queryRaw<{ line: string; pen: string; date: string }[]>`
        SELECT credit_limit::text AS line, opening_balance_pen::text AS pen,
               opening_balance_date::text AS date
        FROM credit_cards WHERE id = ${card.id}::uuid
      `;
      expect(row).toEqual({ line: '5000.00', pen: '1200.50', date: '2026-09-01' });
    });

    it('accepts a fixed payment day and a zero line, without an opening balance', async () => {
      const card = await visaCard({
        creditLimit: { amount: '0.00', currency: 'PEN' },
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
      });

      expect(card).toMatchObject({
        creditLimit: { amount: '0.00', currency: 'PEN' },
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
        openingBalance: null,
      });
    });

    it('answers 409 when the card is already set up, and keeps the first one', async () => {
      await visaCard();

      const response = await configure({
        paymentMethodId: visa,
        ...SETTINGS,
        statementDay: 5,
      }).expect(409);

      expect(codeOf(response)).toBe(problemType('CREDIT_CARD_ALREADY_CONFIGURED'));
      expect((await list()).map((card) => card.statementDay)).toEqual([20]);
    });

    it('answers 422 for a payment method that is not a credit card', async () => {
      const response = await configure({ paymentMethodId: savings, ...SETTINGS }).expect(422);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_CREDIT_CARD'));
    });

    it('answers 422 for an archived card', async () => {
      await request(server)
        .patch(`${METHODS}/${visa}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ archived: true })
        .expect(200);

      const response = await configure({ paymentMethodId: visa, ...SETTINGS }).expect(422);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_ARCHIVED'));
    });

    it.each([
      [
        'a line in a currency the card does not accept',
        { creditLimit: { amount: '100.00', currency: 'USD' } },
        'CREDIT_CARD_CURRENCY_NOT_ACCEPTED',
      ],
      [
        'a negative line',
        { creditLimit: { amount: '-1.00', currency: 'PEN' } },
        'CREDIT_LIMIT_NEGATIVE',
      ],
      [
        'a line with three decimals',
        { creditLimit: { amount: '1.001', currency: 'PEN' } },
        'INVALID_AMOUNT',
      ],
      ['statement day 32', { statementDay: 32 }, 'STATEMENT_DAY_INVALID'],
      [
        '61 days after the statement',
        { paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 61 } },
        'PAYMENT_DUE_RULE_INVALID',
      ],
      [
        'an opening balance dated in the future',
        { openingBalance: { date: '2999-01-01', amounts: [{ amount: '1.00', currency: 'PEN' }] } },
        'OPENING_BALANCE_DATE_IN_FUTURE',
      ],
      [
        'an opening balance in dollars on a card in soles',
        { openingBalance: { date: '2026-09-01', amounts: [{ amount: '1.00', currency: 'USD' }] } },
        'CREDIT_CARD_CURRENCY_NOT_ACCEPTED',
      ],
    ])('answers 422 for %s, saying which rule broke', async (_case, extra, code) => {
      const response = await configure({ paymentMethodId: amex, ...SETTINGS, ...extra }).expect(
        422,
      );

      expect(codeOf(response)).toBe(problemType(code));
      await expect(prisma.creditCard.count()).resolves.toBe(0);
    });

    it.each([
      ['a userId', { userId: MISSING }],
      ['a card number', { number: '4111111111111111' }],
      ['a line as a number', { creditLimit: { amount: 5000, currency: 'PEN' } }],
      [
        'a date that does not exist',
        { openingBalance: { date: '2026-02-30', amounts: [{ amount: '1.00', currency: 'PEN' }] } },
      ],
    ])('refuses a body with %s', async (_case, extra) => {
      const response = await configure({ paymentMethodId: visa, ...SETTINGS, ...extra }).expect(
        422,
      );

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });

    it('answers 404 for a payment method that does not exist', async () => {
      const response = await configure({ paymentMethodId: MISSING, ...SETTINGS }).expect(404);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
    });
  });

  describe('listing the cards', () => {
    it('answers an empty list without cards', async () => {
      await expect(list()).resolves.toEqual([]);
    });

    it('lists them in the order they were set up, archived ones included and marked', async () => {
      await visaCard();
      await configure({ paymentMethodId: amex, ...SETTINGS, statementDay: 5 }).expect(201);
      await request(server)
        .patch(`${METHODS}/${visa}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ archived: true })
        .expect(200);

      const cards = await list();

      expect(cards.map((card) => [card.paymentMethod.alias, card.paymentMethod.archived])).toEqual([
        ['Visa', true],
        ['Amex', false],
      ]);
    });
  });

  describe('correcting a card', () => {
    it('changes only what it gets, and removes the opening balance with null', async () => {
      const card = await visaCard({
        openingBalance: { date: '2026-09-01', amounts: [{ amount: '10.00', currency: 'PEN' }] },
      });

      const changed = await correct(card.id, { statementDay: 5 }).expect(200);
      const removed = await correct(card.id, { openingBalance: null }).expect(200);

      expect(changed.body).toMatchObject({
        statementDay: 5,
        creditLimit: { amount: '5000.00', currency: 'PEN' },
        openingBalance: { date: '2026-09-01' },
      });
      expect((removed.body as CardBody).openingBalance).toBeNull();
    });

    it('switches the payment rule, leaving no trace of the old one', async () => {
      const card = await visaCard();

      await correct(card.id, { paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 } }).expect(200);

      const [row] = await prisma.$queryRaw<{ days: number | null; day: number | null }[]>`
        SELECT due_days_after_statement AS days, due_day_of_month AS day
        FROM credit_cards WHERE id = ${card.id}::uuid
      `;
      expect(row).toEqual({ days: null, day: 5 });
    });

    it('still corrects a card whose payment method was archived', async () => {
      const card = await visaCard();
      await request(server)
        .patch(`${METHODS}/${visa}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ archived: true })
        .expect(200);

      const response = await correct(card.id, { statementDay: 28 }).expect(200);

      expect(response.body).toMatchObject({ statementDay: 28, paymentMethod: { archived: true } });
    });

    it('answers 422 when the card would break a rule, and changes nothing', async () => {
      const card = await visaCard();

      const response = await correct(card.id, { statementDay: 0 }).expect(422);

      expect(codeOf(response)).toBe(problemType('STATEMENT_DAY_INVALID'));
      expect((await list())[0]?.statementDay).toBe(20);
    });

    it.each([
      ['nothing to change', {}],
      ['moving it to another payment method', { paymentMethodId: MISSING }],
    ])('refuses a body with %s', async (_case, body) => {
      const card = await visaCard();

      await correct(card.id, body).expect(422);
    });

    it('answers 422 for an id that is not a UUID, and 404 for one that does not exist', async () => {
      await correct('visa', { statementDay: 5 }).expect(422);
      const response = await correct(MISSING, { statementDay: 5 }).expect(404);

      expect(codeOf(response)).toBe(problemType('CREDIT_CARD_NOT_FOUND'));
    });
  });

  describe('user isolation (anti-IDOR)', () => {
    it('answers 404 when setting up the payment method of another account, and saves nothing', async () => {
      const hers = await method(
        { kind: 'CREDIT_CARD', alias: 'Visa', institution: 'BCP', last4: '1111' },
        bruno,
      );

      const response = await configure({ paymentMethodId: hers, ...SETTINGS }).expect(404);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
      await expect(prisma.creditCard.count()).resolves.toBe(0);
    });

    it('answers 404 when correcting the card of another account, and changes nothing', async () => {
      const card = await visaCard();

      const response = await correct(card.id, { statementDay: 5 }, bruno).expect(404);

      expect(codeOf(response)).toBe(problemType('CREDIT_CARD_NOT_FOUND'));
      expect((await list())[0]?.statementDay).toBe(20);
    });

    // El caso de uso ya da 404 porque tampoco encuentra el método de pago de la tarjeta en la
    // otra cuenta; esto prueba que el repositorio, por su cuenta, tampoco la lee ni la toca.
    it('keeps the repository itself from reading or writing the card of another account', async () => {
      const card = await visaCard();
      const repository = app.get<CreditCardRepository>(CREDIT_CARD_REPOSITORY);
      const brunoId = (await prisma.user.findUniqueOrThrow({ where: { email: BRUNO.email } })).id;

      await expect(repository.find(brunoId, card.id)).resolves.toBeNull();
      await expect(
        repository.update(brunoId, card.id, {
          creditLimit: Money.of('1.00', 'PEN'),
          statementDay: 5,
          paymentDueRule: { kind: 'DAY_OF_MONTH', day: 10 },
          openingBalance: null,
        }),
      ).resolves.toBeNull();
      expect((await list())[0]).toMatchObject({
        statementDay: 20,
        creditLimit: { amount: '5000.00' },
      });
    });

    it('never lists the cards of another account', async () => {
      await visaCard();

      await expect(list(bruno)).resolves.toEqual([]);
    });
  });

  describe('access', () => {
    const routes = [
      ['GET', undefined],
      ['POST', SETTINGS],
      ['PATCH', { statementDay: 5 }],
    ] as const;

    function send(method: string, body: object | undefined): request.Test {
      if (method === 'GET') return request(server).get(CARDS);
      if (method === 'POST') return request(server).post(CARDS).send(body);
      return request(server).patch(`${CARDS}/${MISSING}`).send(body);
    }

    it.each(routes)('%s requires a session', async (method, body) => {
      await send(method, body).expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it.each(routes)('%s refuses a personal access token', async (method, body) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await send(method, body).set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(routes)('%s answers 404 while the credit cards are off', async (method, body) => {
      process.env.FEATURE_CREDIT_CARDS = 'false';

      await send(method, body).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
