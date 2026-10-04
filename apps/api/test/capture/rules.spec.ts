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
const METHODS = `/${API_PREFIX}/payment-methods`;
const CAPTURES = `/${API_PREFIX}/captures`;
const RULES = `/${API_PREFIX}/categorization-rules`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
// 4 de octubre de 2026, 10:00 en Lima.
const NOW = new Date('2026-10-04T15:00:00.000Z');

interface RuleBody {
  id: string;
  pattern: string;
  categoryId: string;
  priority: number;
}

describe('categorization rules', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let anaPhone: string;
  let groceries: string;
  let fees: string;

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

  function rule(body: object, session = ana): request.Test {
    return request(server).post(RULES).set('Authorization', `Bearer ${session}`).send(body);
  }

  it('creates, lists, changes and deletes a rule', async () => {
    const created = (await rule({ pattern: ' Tambo ', categoryId: groceries }).expect(201))
      .body as RuleBody;
    await rule({ pattern: 'Cliente', categoryId: fees, priority: 5 }).expect(201);

    expect(created).toEqual({
      id: expect.any(String) as string,
      pattern: 'Tambo',
      categoryId: groceries,
      priority: 0,
    });
    const listed = (await as(ana).get(RULES).expect(200)).body as RuleBody[];
    expect(listed.map(({ pattern }) => pattern)).toEqual(['Cliente', 'Tambo']);

    await expect(
      as(ana).patch(`${RULES}/${created.id}`, { pattern: 'Tambo Larco', priority: 9 }).expect(200),
    ).resolves.toMatchObject({ body: { pattern: 'Tambo Larco', priority: 9 } });

    await request(server)
      .delete(`${RULES}/${created.id}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);
    expect(((await as(ana).get(RULES).expect(200)).body as RuleBody[]).length).toBe(1);
  });

  it('answers 409 to a pattern the account already has, ignoring accents and case', async () => {
    await rule({ pattern: 'Tambo', categoryId: groceries }).expect(201);

    const response = await rule({ pattern: 'TAMBÓ', categoryId: fees }).expect(409);

    expect((response.body as ProblemDetails).type).toBe(problemType('RULE_PATTERN_TAKEN'));
  });

  it('answers 422 to an archived category', async () => {
    await request(server)
      .patch(`${CATEGORIES}/${groceries}`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ archived: true })
      .expect(200);

    const response = await rule({ pattern: 'Tambo', categoryId: groceries }).expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType('CATEGORY_ARCHIVED'));
  });

  it('gives its category to the captures in the inbox that have none (decided 2026-10-04)', async () => {
    const waiting = await captured();
    const chosen = await captured({ occurredAt: '2026-10-03T12:00:00-05:00', merchant: 'Tambo 2' });
    await as(ana).patch(`${CAPTURES}/${chosen}`, { categoryId: groceries }).expect(200);
    const other = await create(ana, CATEGORIES, {
      name: 'Antojos',
      type: 'VARIABLE_EXPENSE',
      color: '#8E24AA',
      icon: 'cookie',
    });

    await rule({ pattern: 'tambo', categoryId: other }).expect(201);

    await expect(as(ana).get(`${CAPTURES}/${waiting}`).expect(200)).resolves.toMatchObject({
      body: { categoryId: other },
    });
    await expect(as(ana).get(`${CAPTURES}/${chosen}`).expect(200)).resolves.toMatchObject({
      body: { categoryId: groceries },
    });
  });

  it('follows a category merge with its rules and the captures not yet confirmed', async () => {
    const market = await create(ana, CATEGORIES, {
      name: 'Mercado',
      type: 'VARIABLE_EXPENSE',
      color: '#8E24AA',
      icon: 'store',
    });
    const created = (await rule({ pattern: 'Tambo', categoryId: market }).expect(201))
      .body as RuleBody;
    const waiting = await captured();
    await as(ana).patch(`${CAPTURES}/${waiting}`, { categoryId: market }).expect(200);

    await request(server)
      .post(`${CATEGORIES}/${market}/merge`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ intoCategoryId: groceries })
      .expect(200);

    const listed = (await as(ana).get(RULES).expect(200)).body as RuleBody[];
    expect(listed.find(({ id }) => id === created.id)?.categoryId).toBe(groceries);
    await expect(as(ana).get(`${CAPTURES}/${waiting}`).expect(200)).resolves.toMatchObject({
      body: { categoryId: groceries },
    });
  });

  describe('access', () => {
    it('answers 404 to the rule of another account, and leaves it alone', async () => {
      const theirCategory = await create(bruno, CATEGORIES, {
        name: 'Víveres',
        type: 'VARIABLE_EXPENSE',
        color: '#E53935',
        icon: 'cart',
      });
      const theirs = (
        await rule({ pattern: 'Tambo', categoryId: theirCategory }, bruno).expect(201)
      ).body as RuleBody;

      await as(ana).patch(`${RULES}/${theirs.id}`, { priority: 9 }).expect(404);
      await request(server)
        .delete(`${RULES}/${theirs.id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(404);

      expect((await as(ana).get(RULES).expect(200)).body).toEqual([]);
      await expect(as(bruno).get(RULES).expect(200)).resolves.toMatchObject({
        body: [{ id: theirs.id, priority: 0 }],
      });
    });

    it('answers 404 to the category of another account', async () => {
      const theirCategory = await create(bruno, CATEGORIES, {
        name: 'Víveres',
        type: 'VARIABLE_EXPENSE',
        color: '#E53935',
        icon: 'cart',
      });

      const response = await rule({ pattern: 'Tambo', categoryId: theirCategory }).expect(404);

      expect((response.body as ProblemDetails).type).toBe(problemType('CATEGORY_NOT_FOUND'));
    });

    it('refuses a personal token, requires a session, and answers 404 while off', async () => {
      await as(anaPhone).get(RULES).expect(403);
      await request(server).get(RULES).expect(401);
      process.env.FEATURE_CAPTURE = 'false';

      await as(ana).get(RULES).expect(404);
    });
  });
});
