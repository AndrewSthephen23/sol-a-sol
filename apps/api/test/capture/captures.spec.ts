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
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const CAPTURES = `/${API_PREFIX}/captures`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
// 3 de octubre de 2026, 12:00 en Lima.
const NOW = new Date('2026-10-03T17:00:00.000Z');

/** Lo que manda el atajo de iPhone, inventado con la forma de uno real. */
const SHORTCUT = {
  source: 'IOS_SHORTCUT',
  occurredAt: '2026-10-03T11:30:00-05:00',
  amountText: '25.90',
  merchant: 'Tambo Larco',
  card: 'Visa BCP',
};

interface CaptureBody {
  id: string;
  source: string;
  status: string;
  parsed: boolean;
  type: string;
  amount: string | null;
  currency: string | null;
  merchant: string | null;
  cardLast4: string | null;
  date: string;
  occurredAt: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  warnings: string[];
}

describe('POST /captures', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let anaSession: string;
  let anaPhone: string;
  let brunoPhone: string;
  let visa: string;
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
    anaSession = await sessionOf(ANA);
    const brunoSession = await sessionOf(BRUNO);
    anaPhone = (await phoneOf(anaSession)).token;
    brunoPhone = (await phoneOf(brunoSession)).token;
    visa = await create(anaSession, METHODS, {
      kind: 'CREDIT_CARD',
      alias: 'Visa BCP',
      institution: 'BCP',
      last4: '4242',
      currency: 'PEN',
    });
    // Nombres fuera de la semilla de categorías, o darían 409.
    groceries = await create(anaSession, CATEGORIES, {
      name: 'Víveres',
      type: 'VARIABLE_EXPENSE',
      color: '#E53935',
      icon: 'cart',
    });
    // Las reglas todavía no tienen endpoint (tarea 08): se guardan directo.
    const [ana] = await prisma.user.findMany({ where: { email: ANA.email } });
    await prisma.categorizationRule.create({
      data: { userId: ana?.id ?? '', pattern: 'Tambo', patternKey: 'tambo', categoryId: groceries },
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

  async function phoneOf(session: string): Promise<{ id: string; token: string }> {
    const response = await request(server)
      .post(TOKENS)
      .set('Authorization', `Bearer ${session}`)
      .send({ name: 'iPhone', scopes: ['captures:write'] })
      .expect(201);

    return response.body as { id: string; token: string };
  }

  async function create(session: string, path: string, body: object): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function send(body: object, token = anaPhone, key?: string): request.Test {
    const sent = request(server).post(CAPTURES).set('Authorization', `Bearer ${token}`);

    return (key === undefined ? sent : sent.set('Idempotency-Key', key)).send(body);
  }

  it('saves what the shortcut sent and answers with what it understood', async () => {
    const response = await send(SHORTCUT).expect(201);

    expect(response.body).toEqual({
      id: expect.any(String) as string,
      source: 'IOS_SHORTCUT',
      status: 'PENDING',
      parsed: true,
      type: 'VARIABLE_EXPENSE',
      amount: '25.90',
      // La moneda, de la Visa, que tiene una sola (decisión 3).
      currency: 'PEN',
      merchant: 'Tambo Larco',
      cardLast4: null,
      date: '2026-10-03',
      occurredAt: '2026-10-03T16:30:00.000Z',
      categoryId: groceries,
      paymentMethodId: visa,
      warnings: [],
    } satisfies CaptureBody);
    const row = await prisma.capture.findUniqueOrThrow({
      where: { id: (response.body as CaptureBody).id },
    });
    expect(row.rawPayload).toEqual(SHORTCUT);
  });

  it('reads the text of the notification an Android automation sends', async () => {
    const response = await send({
      source: 'ANDROID_AUTOMATION',
      occurredAt: '2026-10-03T16:30:00Z',
      rawText: 'Consumo de US$ 12.00 con tu tarjeta ****4242',
    }).expect(201);

    expect(response.body).toMatchObject({
      parsed: true,
      amount: '12.00',
      currency: 'USD',
      warnings: ['UNKNOWN_SOURCE'],
    });
  });

  it('saves a capture it does not understand, with parsed false', async () => {
    const response = await send({
      source: 'ANDROID_AUTOMATION',
      occurredAt: '2026-10-03T16:30:00Z',
      rawText: 'Tienes una notificación nueva',
    }).expect(201);

    expect(response.body).toMatchObject({
      parsed: false,
      amount: null,
      warnings: ['UNKNOWN_SOURCE', 'AMOUNT_NOT_FOUND'],
    });
    await expect(prisma.capture.count()).resolves.toBe(1);
  });

  it('never stores a full card number', async () => {
    await send({ ...SHORTCUT, card: '4111 1111 1111 4242' }).expect(201);

    const [row] = await prisma.capture.findMany();
    expect(JSON.stringify(row?.rawPayload)).not.toMatch(/4111/u);
    expect(row?.cardLast4).toBe('4242');
  });

  it('marks a capture already registered by hand that day as a duplicate', async () => {
    await create(anaSession, TRANSACTIONS, {
      date: '2026-10-03',
      type: 'VARIABLE_EXPENSE',
      categoryId: groceries,
      amount: '25.90',
      currency: 'PEN',
      description: 'Almuerzo',
      merchant: 'TAMBO LARCO',
    });

    await expect(send(SHORTCUT).expect(201)).resolves.toMatchObject({
      body: { status: 'DUPLICATE' },
    });
  });

  describe('idempotency', () => {
    it('answers a retry with the same key with the original, 200, and saves it once', async () => {
      const first = await send(SHORTCUT, anaPhone, 'reintento-1').expect(201);

      const retry = await send(
        { ...SHORTCUT, amountText: '99.00' },
        anaPhone,
        'reintento-1',
      ).expect(200);

      expect(retry.body).toEqual(first.body);
      await expect(prisma.capture.count()).resolves.toBe(1);
    });

    it('recognizes a retry without a key by its whole request', async () => {
      await send(SHORTCUT).expect(201);
      await send(SHORTCUT).expect(200);

      await expect(prisma.capture.count()).resolves.toBe(1);
    });

    it('lets another account use the same key', async () => {
      await send(SHORTCUT, anaPhone, 'la-misma').expect(201);

      await send(SHORTCUT, brunoPhone, 'la-misma').expect(201);

      await expect(prisma.capture.count()).resolves.toBe(2);
    });

    it('rejects a key that is too long, and saves nothing', async () => {
      const response = await send(SHORTCUT, anaPhone, 'x'.repeat(201)).expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType('VALIDATION_FAILED'));
      await expect(prisma.capture.count()).resolves.toBe(0);
    });
  });

  it.each([
    ['without its instant', { source: 'IOS_SHORTCUT', amountText: '25.90' }],
    ['without its source', { occurredAt: SHORTCUT.occurredAt }],
    ['with an instant without a time zone', { ...SHORTCUT, occurredAt: '2026-10-03T11:30:00' }],
    ['with a userId in the body', { ...SHORTCUT, userId: '01999999-9999-7999-8999-000000000001' }],
  ])('rejects a request %s with 422, and saves nothing', async (_label, body) => {
    await send(body).expect(422);

    await expect(prisma.capture.count()).resolves.toBe(0);
  });

  describe('access', () => {
    it('requires a personal token', async () => {
      await request(server).post(CAPTURES).send(SHORTCUT).expect(401);
    });

    // La ruta es del teléfono: la web nunca crea capturas (decidido el 2026-10-04).
    it('refuses a session with 403', async () => {
      const response = await send(SHORTCUT, anaSession).expect(403);

      expect((response.body as ProblemDetails).type).toBe(
        problemType('PERSONAL_ACCESS_TOKEN_REQUIRED'),
      );
      await expect(prisma.capture.count()).resolves.toBe(0);
    });

    it('refuses a revoked token with 401', async () => {
      const phone = await phoneOf(anaSession);
      await request(server)
        .delete(`${TOKENS}/${phone.id}`)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(204);

      await send(SHORTCUT, phone.token).expect(401);
    });

    it('refuses a made-up token with 401', async () => {
      await send(SHORTCUT, 'sas_pat_inventado.no-vale').expect(401);
    });

    // Anti-IDOR: el userId sale del token. Bruno no ve la Visa ni las reglas de Ana, ni choca
    // con sus capturas: con la moneda en el monto, la suya sí se compara con otras, y no es
    // duplicada de la de Ana aunque sea idéntica.
    it('uses only what belongs to the account of the token', async () => {
      await send({ ...SHORTCUT, amountText: 'S/ 25.90' }).expect(201);

      const response = await send({ ...SHORTCUT, amountText: 'S/ 25.90' }, brunoPhone).expect(201);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        currency: 'PEN',
        paymentMethodId: null,
        categoryId: null,
      });
      const [bruno] = await prisma.user.findMany({ where: { email: BRUNO.email } });
      await expect(prisma.capture.count({ where: { userId: bruno?.id } })).resolves.toBe(1);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while the capture module is off', async () => {
      process.env.FEATURE_CAPTURE = 'false';

      await send(SHORTCUT).expect(404);
    });
  });
});
