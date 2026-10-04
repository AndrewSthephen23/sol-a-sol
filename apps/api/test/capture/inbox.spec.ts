import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { FixedClock } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { PurgeDiscardedCaptures } from '../../src/modules/capture/application/inbox.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const CAPTURES = `/${API_PREFIX}/captures`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const MISSING = '01999999-9999-7999-8999-000000000001';
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

interface InboxPage {
  items: InboxCapture[];
  nextCursor: string | null;
}

describe('the capture inbox', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let anaPhone: string;
  let brunoPhone: string;
  let groceries: string;
  let fees: string;
  let visa: string;

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
    fees = await create(ana, CATEGORIES, {
      name: 'Honorarios',
      type: 'INCOME',
      color: '#43A047',
      icon: 'briefcase',
    });
    visa = await create(ana, METHODS, {
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

  describe('listing', () => {
    it('lists the inbox newest first, with the duplicates and the raw request', async () => {
      const older = await captured();
      const duplicate = await captured({ occurredAt: '2026-10-03T11:31:00-05:00' });
      const discarded = await captured({
        occurredAt: '2026-10-03T12:00:00-05:00',
        merchant: 'Wong',
      });
      await as(ana).post(`${CAPTURES}/${discarded}/discard`).expect(200);
      await captured({}, brunoPhone);

      const response = await as(ana).get(CAPTURES).expect(200);
      const page = response.body as InboxPage;

      expect(page.items.map(({ id, status }) => [id, status])).toEqual([
        [duplicate, 'DUPLICATE'],
        [older, 'PENDING'],
      ]);
      expect(page.items[1]?.raw).toEqual({
        source: 'IOS_SHORTCUT',
        occurredAt: '2026-10-03T11:30:00-05:00',
        amountText: 'S/ 25.90',
        merchant: 'Tambo',
      });
      expect(page.nextCursor).toBeNull();
    });

    it('pages with an opaque cursor', async () => {
      for (const minute of ['10', '20', '30']) {
        await captured({ occurredAt: `2026-10-03T11:${minute}:00-05:00`, merchant: minute });
      }

      const first = (await as(ana).get(`${CAPTURES}?limit=2`).expect(200)).body as InboxPage;
      const second = (
        await as(ana)
          .get(`${CAPTURES}?limit=2&cursor=${first.nextCursor ?? ''}`)
          .expect(200)
      ).body as InboxPage;

      expect(first.items.map(({ merchant }) => merchant)).toEqual(['30', '20']);
      expect(second.items.map(({ merchant }) => merchant)).toEqual(['10']);
      expect(second.nextCursor).toBeNull();
    });

    it('rejects a cursor it did not give', async () => {
      const response = await as(ana).get(`${CAPTURES}?cursor=inventado`).expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType('INVALID_CURSOR'));
    });
  });

  describe('one capture', () => {
    it('gives a capture of the account', async () => {
      const id = await captured();

      await expect(as(ana).get(`${CAPTURES}/${id}`).expect(200)).resolves.toMatchObject({
        body: { id, status: 'PENDING', amount: '25.90' },
      });
    });

    // Anti-IDOR: 404 y no 403, como una que no existe.
    it('answers 404 to the capture of another account', async () => {
      const theirs = await captured({}, brunoPhone);

      const response = await as(ana).get(`${CAPTURES}/${theirs}`).expect(404);

      expect((response.body as ProblemDetails).type).toBe(problemType('CAPTURE_NOT_FOUND'));
      await as(ana).get(`${CAPTURES}/${MISSING}`).expect(404);
    });
  });

  describe('correcting (decision 10)', () => {
    it('corrects every field, and takes the currency of the chosen method', async () => {
      const id = await captured({ amountText: '25.90' });

      const response = await as(ana)
        .patch(`${CAPTURES}/${id}`, {
          date: '2026-10-02',
          amount: '30.00',
          categoryId: groceries,
          paymentMethodId: visa,
          merchant: 'Tambo Larco',
          description: 'Almuerzo',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        date: '2026-10-02',
        amount: '30.00',
        currency: 'PEN',
        categoryId: groceries,
        paymentMethodId: visa,
        merchant: 'Tambo Larco',
        description: 'Almuerzo',
        status: 'PENDING',
      });
    });

    it('clears the category when the type changes without one', async () => {
      const id = await captured();
      await as(ana).patch(`${CAPTURES}/${id}`, { categoryId: groceries }).expect(200);

      await expect(
        as(ana).patch(`${CAPTURES}/${id}`, { type: 'INCOME' }).expect(200),
      ).resolves.toMatchObject({ body: { type: 'INCOME', categoryId: null } });
      await as(ana).patch(`${CAPTURES}/${id}`, { categoryId: fees }).expect(200);
    });

    it('refuses a category of another type with 422', async () => {
      const id = await captured();

      const response = await as(ana).patch(`${CAPTURES}/${id}`, { categoryId: fees }).expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType('CATEGORY_TYPE_MISMATCH'));
    });

    it('refuses the category of another account with 404', async () => {
      const id = await captured();
      const theirs = await create(bruno, CATEGORIES, {
        name: 'Víveres',
        type: 'VARIABLE_EXPENSE',
        color: '#E53935',
        icon: 'cart',
      });

      const response = await as(ana).patch(`${CAPTURES}/${id}`, { categoryId: theirs }).expect(404);

      expect((response.body as ProblemDetails).type).toBe(problemType('CATEGORY_NOT_FOUND'));
    });

    it('refuses a future date and an amount of zero', async () => {
      const id = await captured();

      await as(ana).patch(`${CAPTURES}/${id}`, { date: '2026-10-05' }).expect(422);
      await as(ana).patch(`${CAPTURES}/${id}`, { amount: '0.00' }).expect(422);
    });

    it('answers 404 to the capture of another account, and leaves it alone', async () => {
      const theirs = await captured({}, brunoPhone);

      await as(ana).patch(`${CAPTURES}/${theirs}`, { merchant: 'Ajeno' }).expect(404);

      await expect(
        prisma.capture.findUniqueOrThrow({ where: { id: theirs } }),
      ).resolves.toMatchObject({ merchant: 'Tambo' });
    });

    it('answers 409 to a discarded capture', async () => {
      const id = await captured();
      await as(ana).post(`${CAPTURES}/${id}/discard`).expect(200);

      const response = await as(ana).patch(`${CAPTURES}/${id}`, { merchant: 'Wong' }).expect(409);

      expect((response.body as ProblemDetails).type).toBe(problemType('CAPTURE_NOT_PENDING'));
    });
  });

  describe('discarding and undoing (decision 11)', () => {
    it('discards a duplicate, lists it apart and takes it back as a duplicate', async () => {
      await captured();
      const duplicate = await captured({ occurredAt: '2026-10-03T11:31:00-05:00' });

      await expect(
        as(ana).post(`${CAPTURES}/${duplicate}/discard`).expect(200),
      ).resolves.toMatchObject({ body: { status: 'DISCARDED', discardedAt: NOW.toISOString() } });
      const discarded = (await as(ana).get(`${CAPTURES}?status=discarded`).expect(200))
        .body as InboxPage;
      expect(discarded.items.map(({ id }) => id)).toEqual([duplicate]);

      await expect(
        as(ana).post(`${CAPTURES}/${duplicate}/restore`).expect(200),
      ).resolves.toMatchObject({ body: { status: 'DUPLICATE', discardedAt: null } });
    });

    it('answers 409 to discarding twice and to restoring one that is not discarded', async () => {
      const id = await captured();
      await as(ana).post(`${CAPTURES}/${id}/restore`).expect(409);
      await as(ana).post(`${CAPTURES}/${id}/discard`).expect(200);

      const response = await as(ana).post(`${CAPTURES}/${id}/discard`).expect(409);

      expect((response.body as ProblemDetails).type).toBe(problemType('CAPTURE_NOT_PENDING'));
    });

    it('answers 404 to discarding or restoring the capture of another account', async () => {
      const theirs = await captured({}, brunoPhone);

      await as(ana).post(`${CAPTURES}/${theirs}/discard`).expect(404);
      await as(bruno).post(`${CAPTURES}/${theirs}/discard`).expect(200);
      await as(ana).post(`${CAPTURES}/${theirs}/restore`).expect(404);
    });

    it('deletes for good the captures discarded more than 90 days ago', async () => {
      const old = await captured();
      const recent = await captured({ merchant: 'Wong' });
      await as(ana).post(`${CAPTURES}/${old}/discard`).expect(200);
      await as(ana).post(`${CAPTURES}/${recent}/discard`).expect(200);
      await prisma.capture.update({
        where: { id: old },
        data: { discardedAt: new Date('2026-07-05T00:00:00.000Z') },
      });

      await expect(app.get(PurgeDiscardedCaptures).execute()).resolves.toBe(1);

      await expect(prisma.capture.findMany({ select: { id: true } })).resolves.toEqual([
        { id: recent },
      ]);
    });

    it('runs the purge every day', () => {
      expect(app.get(SchedulerRegistry).getCronJob('purge-discarded-captures')).toBeDefined();
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      await request(server).get(CAPTURES).expect(401);
    });

    // El teléfono solo crea capturas: revisar la bandeja es de la web.
    it('refuses a personal token in every inbox route', async () => {
      const id = await captured();

      await as(anaPhone).get(CAPTURES).expect(403);
      await as(anaPhone).get(`${CAPTURES}/${id}`).expect(403);
      await as(anaPhone).patch(`${CAPTURES}/${id}`, { merchant: 'Wong' }).expect(403);
      await as(anaPhone).post(`${CAPTURES}/${id}/discard`).expect(403);
      await as(anaPhone).post(`${CAPTURES}/${id}/restore`).expect(403);
    });

    it('answers 404 while the capture module is off', async () => {
      process.env.FEATURE_CAPTURE = 'false';

      await as(ana).get(CAPTURES).expect(404);
    });
  });
});
