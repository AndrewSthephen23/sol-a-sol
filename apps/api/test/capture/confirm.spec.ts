import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FixedClock } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { PrismaTransactionRepository } from '../../src/modules/transactions/infrastructure/prisma-transaction-repository.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const CAPTURES = `/${API_PREFIX}/captures`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
// 4 de octubre de 2026, 10:00 en Lima.
const NOW = new Date('2026-10-04T15:00:00.000Z');

interface InboxCapture {
  id: string;
  status: string;
  type: string;
  amount: string | null;
  currency: string | null;
  merchant: string | null;
  date: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  description: string | null;
  raw: Record<string, string> | null;
  discardedAt: string | null;
}

interface ConfirmedCapture extends InboxCapture {
  transactionId: string;
}

describe('confirming captures', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let anaPhone: string;
  let brunoPhone: string;
  let groceries: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_TRANSACTIONS = 'true';
    process.env.FEATURE_CAPTURE = 'true';
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
    process.env.FEATURE_CAPTURE = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    anaPhone = await phoneOf(ana);
    brunoPhone = await phoneOf(bruno);
    // Nombres fuera de la semilla de categorías, o darían 409.
    groceries = await create(ana, CATEGORIES, {
      name: 'Víveres',
      type: 'VARIABLE_EXPENSE',
      color: '#E53935',
      icon: 'cart',
    });
    await create(ana, CATEGORIES, {
      name: 'Honorarios',
      type: 'INCOME',
      color: '#43A047',
      icon: 'briefcase',
    });
    await create(ana, METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Visa BCP',
      institution: 'BCP',
      last4: '4242',
      currency: 'PEN',
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.FEATURE_CAPTURE;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function phoneOf(session: string): Promise<string> {
    const response = await request(server)
      .post(TOKENS)
      .set('Authorization', `Bearer ${session}`)
      .send({ name: 'iPhone', scopes: ['captures:write'] })
      .expect(201);

    return (response.body as { token: string }).token;
  }

  async function create(session: string, path: string, body: object): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  /** Una captura que llega del teléfono, como en la realidad. */
  async function captured(extra: object = {}, phone = anaPhone): Promise<string> {
    const response = await request(server)
      .post(CAPTURES)
      .set('Authorization', `Bearer ${phone}`)
      .send({
        source: 'IOS_SHORTCUT',
        occurredAt: '2026-10-03T11:30:00-05:00',
        // Con su moneda: sin ella no se buscan duplicados (decidido el 2026-10-04).
        amountText: 'S/ 25.90',
        merchant: 'Tambo',
        ...extra,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function as(session: string) {
    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${session}`),
      patch: (path: string, body: object) =>
        request(server).patch(path).set('Authorization', `Bearer ${session}`).send(body),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${session}`),
    };
  }

  /** Una captura de Ana completa: con monto, moneda, categoría y comercio. */
  async function complete(extra: object = {}): Promise<string> {
    const id = await captured(extra);
    await as(ana).patch(`${CAPTURES}/${id}`, { categoryId: groceries }).expect(200);
    return id;
  }

  it('creates one transaction with its capture and source, and confirms the capture', async () => {
    const id = await complete();

    const response = await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(200);
    const confirmed = response.body as ConfirmedCapture;

    expect(confirmed).toMatchObject({ id, status: 'CONFIRMED', raw: null });
    const transaction = await as(ana).get(`${TRANSACTIONS}/${confirmed.transactionId}`).expect(200);
    expect(transaction.body).toMatchObject({
      date: '2026-10-03',
      type: 'VARIABLE_EXPENSE',
      categoryId: groceries,
      amount: '25.90',
      currency: 'PEN',
      merchant: 'Tambo',
      description: 'Tambo',
      source: 'IOS_SHORTCUT',
      captureId: id,
    });
    // El texto crudo se borra al confirmar (decisión 14).
    await expect(prisma.capture.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      status: 'CONFIRMED',
      rawPayload: null,
      transactionId: confirmed.transactionId,
    });
    const inbox = await as(ana).get(CAPTURES).expect(200);
    expect((inbox.body as { items: unknown[] }).items).toEqual([]);
  });

  it('answers a second confirmation with 409, and creates nothing', async () => {
    const id = await complete();
    await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(200);

    const response = await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(409);

    expect((response.body as ProblemDetails).type).toBe(problemType('CAPTURE_NOT_PENDING'));
    await expect(prisma.transaction.count({ where: { captureId: id } })).resolves.toBe(1);
  });

  // Dos pestañas a la vez: la base no deja una segunda transacción.
  it('creates a single transaction when two confirmations arrive together', async () => {
    const id = await complete();

    const statuses = await Promise.all([
      as(ana).post(`${CAPTURES}/${id}/confirm`),
      as(ana).post(`${CAPTURES}/${id}/confirm`),
    ]).then((responses) => responses.map(({ status }) => status).toSorted());

    expect(statuses).toEqual([200, 409]);
    await expect(prisma.transaction.count({ where: { captureId: id } })).resolves.toBe(1);
  });

  it('keeps the capture confirmed if its transaction is deleted later', async () => {
    const id = await complete();
    const { transactionId } = (await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(200))
      .body as ConfirmedCapture;

    await request(server)
      .delete(`${TRANSACTIONS}/${transactionId}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);

    await expect(prisma.capture.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
  });

  it.each([
    ['without a category', {}, 'CAPTURE_CATEGORY_MISSING'],
    ['without an amount', { amountText: 'veinte' }, 'CAPTURE_AMOUNT_MISSING'],
  ])(
    'refuses a capture %s with 422 and its code, creating nothing',
    async (_label, extra, code) => {
      const id = await captured(extra);

      const response = await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType(code));
      await expect(prisma.transaction.count()).resolves.toBe(0);
    },
  );

  it('lets the rules of the transaction through: an archived category is 422', async () => {
    const id = await complete();
    await request(server)
      .patch(`${CATEGORIES}/${groceries}`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ archived: true })
      .expect(200);

    const response = await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType('CATEGORY_ARCHIVED'));
    await expect(prisma.capture.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  describe('remembering the category for the merchant (decision 13)', () => {
    it('creates the rule, and the next capture from that merchant gets the category', async () => {
      const id = await complete();

      await request(server)
        .post(`${CAPTURES}/${id}/confirm`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ rememberCategory: true })
        .expect(200);

      const next = await captured({ occurredAt: '2026-10-04T08:00:00-05:00' });
      await expect(as(ana).get(`${CAPTURES}/${next}`).expect(200)).resolves.toMatchObject({
        body: { categoryId: groceries },
      });
    });

    it('refuses to remember without a merchant, and confirms nothing', async () => {
      const id = await captured({ merchant: '' });
      await as(ana)
        .patch(`${CAPTURES}/${id}`, { categoryId: groceries, description: 'Pago' })
        .expect(200);

      const response = await request(server)
        .post(`${CAPTURES}/${id}/confirm`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ rememberCategory: true })
        .expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType('CAPTURE_MERCHANT_MISSING'));
      await expect(prisma.transaction.count()).resolves.toBe(0);
    });
  });

  it('confirms several, each on its own (decision 10)', async () => {
    const ready = await complete();
    const incomplete = await captured({ merchant: 'Wong' });
    const theirs = await captured({}, brunoPhone);

    const response = await request(server)
      .post(`${CAPTURES}/confirm`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ captures: [{ id: ready }, { id: incomplete }, { id: theirs }] })
      .expect(200);

    expect(response.body).toEqual({
      confirmed: [{ id: ready, transactionId: expect.any(String) as string }],
      failed: [
        { id: incomplete, code: 'CAPTURE_CATEGORY_MISSING' },
        { id: theirs, code: 'CAPTURE_NOT_FOUND' },
      ],
    });
    await expect(
      prisma.capture.findUniqueOrThrow({ where: { id: theirs } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  describe('access', () => {
    it('answers 404 to confirming the capture of another account, and creates nothing', async () => {
      const theirs = await captured({}, brunoPhone);

      await as(ana).post(`${CAPTURES}/${theirs}/confirm`).expect(404);
      await expect(prisma.transaction.count()).resolves.toBe(0);
    });

    it('refuses a personal token in both routes', async () => {
      const id = await complete();

      await as(anaPhone).post(`${CAPTURES}/${id}/confirm`).expect(403);
      await request(server)
        .post(`${CAPTURES}/confirm`)
        .set('Authorization', `Bearer ${anaPhone}`)
        .send({ captures: [{ id }] })
        .expect(403);
    });

    it('requires a session and answers 404 while the module is off', async () => {
      const id = await complete();
      await request(server).post(`${CAPTURES}/${id}/confirm`).expect(401);
      process.env.FEATURE_CAPTURE = 'false';

      await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(404);
    });

    // El repositorio solo: el caso de uso nunca le pasa una captura ajena, así que esto lo
    // esconde (lección de H5).
    it('finds the transaction of a capture only in its own account', async () => {
      const id = await complete();
      await as(ana).post(`${CAPTURES}/${id}/confirm`).expect(200);
      const anaUser = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      const brunoUser = await prisma.user.findUniqueOrThrow({ where: { email: BRUNO.email } });
      const repository = new PrismaTransactionRepository(prisma);

      await expect(repository.findIdByCapture(anaUser.id, id)).resolves.not.toBeNull();
      await expect(repository.findIdByCapture(brunoUser.id, id)).resolves.toBeNull();
    });
  });
});
