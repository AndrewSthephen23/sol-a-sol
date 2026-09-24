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
const METHODS = `/${API_PREFIX}/payment-methods`;
const MISSING = `${METHODS}/01999999-9999-7999-8999-999999999999`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
/** Un "número completo" de ejemplo, corto a propósito para no parecer una tarjeta real. */
const LONG_NUMBER = '1234567890';

const VISA = { kind: 'CREDIT_CARD', alias: 'Visa BCP', institution: 'BCP', last4: '4242' };
const SUELDO = { kind: 'ACCOUNT', alias: 'Sueldo BCP', institution: 'BCP', currency: 'PEN' };
const YAPE = { kind: 'WALLET', alias: 'Yape', institution: 'BCP', currency: 'PEN' };
const EFECTIVO = { kind: 'CASH', alias: 'Efectivo' };

interface PaymentMethodBody {
  id: string;
  kind: string;
  alias: string;
  institution: string | null;
  last4: string | null;
  currency: string | null;
  archivedAt: string | null;
}

describe('payment methods', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
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
    process.env.FEATURE_CATALOG = 'true';
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
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function create(body: object, session = ana): Promise<PaymentMethodBody> {
    const response = await request(server)
      .post(METHODS)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return response.body as PaymentMethodBody;
  }

  async function list(session = ana, query = ''): Promise<PaymentMethodBody[]> {
    const response = await request(server)
      .get(`${METHODS}${query}`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as PaymentMethodBody[];
  }

  function patch(id: string, body: object, session = ana): request.Test {
    return request(server)
      .patch(`${METHODS}/${id}`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  describe('creating one', () => {
    it.each([
      ['a credit card', VISA],
      ['an account', SUELDO],
      ['a wallet', YAPE],
      ['cash', EFECTIVO],
    ])('registers %s', async (_case, body) => {
      const created = await create(body);

      expect(created).toMatchObject({
        institution: null,
        last4: null,
        currency: null,
        archivedAt: null,
        ...body,
      });
      expect(created).not.toHaveProperty('userId');
    });

    it('registers a dual-currency credit card without currency', async () => {
      const created = await create({ ...VISA, currency: null });

      expect(created.currency).toBeNull();
    });

    it.each([
      ['a full card number', { ...VISA, last4: LONG_NUMBER }, 'INVALID_LAST4'],
      ['three digits', { ...VISA, last4: '424' }, 'INVALID_LAST4'],
      ['a card without its last 4 digits', { ...VISA, last4: undefined }, 'LAST4_REQUIRED'],
      ['a wallet with last 4 digits', { ...YAPE, last4: '4242' }, 'LAST4_NOT_ALLOWED'],
      [
        'an account without currency',
        { ...SUELDO, currency: undefined },
        'PAYMENT_METHOD_CURRENCY_REQUIRED',
      ],
      ['cash with a bank', { ...EFECTIVO, institution: 'BCP' }, 'INSTITUTION_NOT_ALLOWED'],
      ['a CVV field', { ...VISA, cvv: '123' }, 'VALIDATION_FAILED'],
      ['an unknown kind', { ...VISA, kind: 'GIFT_CARD' }, 'VALIDATION_FAILED'],
    ])('refuses %s with 422 and saves nothing', async (_case, body, code) => {
      const response = await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${ana}`)
        .send(body)
        .expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(prisma.paymentMethod.count()).resolves.toBe(0);
    });

    // Recortar el número y guardar los últimos 4 sería aceptar en silencio que llegó completo.
    it('does not keep any trace of a full card number it rejected', async () => {
      await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ ...VISA, last4: LONG_NUMBER })
        .expect(422);

      const rows = await prisma.$queryRaw<unknown[]>`SELECT * FROM payment_methods`;
      expect(JSON.stringify(rows)).not.toContain('7890');
    });

    it('refuses an alias already in use, ignoring case, with 409', async () => {
      await create(VISA);

      const response = await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ ...VISA, alias: 'visa bcp', last4: '0931' })
        .expect(409);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_ALIAS_TAKEN'));
    });

    it('refuses the alias of an archived method: it is restored instead', async () => {
      const visa = await create(VISA);
      await patch(visa.id, { archived: true }).expect(200);

      await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${ana}`)
        .send(VISA)
        .expect(409);
    });
  });

  // La regla del proyecto: de una tarjeta, solo alias, banco y últimos 4. Se comprueba en la
  // tabla misma, no en la respuesta: que no exista ninguna columna donde guardar más.
  it('has nowhere to store a card number, a CVV or an expiry date', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payment_methods' ORDER BY column_name
    `;

    expect(columns.map((column) => column.column_name)).toEqual([
      'alias',
      'archived_at',
      'created_at',
      'currency',
      'id',
      'institution',
      'kind',
      'last4',
      'updated_at',
      'user_id',
    ]);
  });

  describe('listing', () => {
    it('shows the active methods ordered by alias', async () => {
      await create(YAPE);
      await create(EFECTIVO);
      const visa = await create(VISA);
      await patch(visa.id, { archived: true }).expect(200);

      const methods = await list();

      expect(methods.map((method) => method.alias)).toEqual(['Efectivo', 'Yape']);
    });

    it('includes the archived ones with includeArchived=true', async () => {
      await create(YAPE);
      const visa = await create(VISA);
      await patch(visa.id, { archived: true }).expect(200);

      const methods = await list(ana, '?includeArchived=true');

      expect(methods.map((method) => method.alias)).toEqual(['Visa BCP', 'Yape']);
    });

    it('refuses an includeArchived that is not true or false', async () => {
      await request(server)
        .get(`${METHODS}?includeArchived=1`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);
    });
  });

  describe('updating one', () => {
    it('corrects the alias, the bank, the last 4 digits and the currency', async () => {
      const visa = await create(VISA);

      const response = await patch(visa.id, {
        alias: 'Visa Signature',
        institution: 'Interbank',
        last4: '0931',
        currency: 'USD',
      }).expect(200);

      expect(response.body).toMatchObject({
        kind: 'CREDIT_CARD',
        alias: 'Visa Signature',
        institution: 'Interbank',
        last4: '0931',
        currency: 'USD',
      });
    });

    it('archives and restores', async () => {
      const visa = await create(VISA);

      const archived = await patch(visa.id, { archived: true }).expect(200);
      const restored = await patch(visa.id, { archived: false }).expect(200);

      expect((archived.body as PaymentMethodBody).archivedAt).not.toBeNull();
      expect((restored.body as PaymentMethodBody).archivedAt).toBeNull();
    });

    it.each([
      ['a change of kind', { kind: 'CASH' }, 'VALIDATION_FAILED'],
      ['an empty change', {}, 'VALIDATION_FAILED'],
      ['leaving a card without its last 4 digits', { last4: null }, 'LAST4_REQUIRED'],
    ])('refuses %s with 422 and changes nothing', async (_case, body, code) => {
      const visa = await create(VISA);

      const response = await patch(visa.id, body).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(
        prisma.paymentMethod.findUnique({ where: { id: visa.id } }),
      ).resolves.toMatchObject({ kind: 'CREDIT_CARD', last4: '4242' });
    });

    it('refuses an alias taken by another method with 409', async () => {
      await create(YAPE);
      const visa = await create(VISA);

      await patch(visa.id, { alias: 'YAPE' }).expect(409);
    });

    it.each([
      ['does not exist', MISSING.split('/').at(-1) ?? ''],
      ['is not even a UUID', 'no-es-un-uuid'],
    ])('answers 404 for a method that %s', async (_case, id) => {
      const response = await patch(id, { alias: 'Otro' }).expect(404);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
    });
  });

  describe('user isolation (anti-IDOR)', () => {
    it("lists only the user's own methods", async () => {
      await create(VISA, ana);
      await create(YAPE, bruno);

      expect((await list(bruno)).map((method) => method.alias)).toEqual(['Yape']);
    });

    it("answers 404 for another user's method and leaves it untouched", async () => {
      const visa = await create(VISA, ana);

      const response = await patch(visa.id, { alias: 'Mía', archived: true }, bruno).expect(404);

      expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
      await expect(
        prisma.paymentMethod.findUnique({ where: { id: visa.id } }),
      ).resolves.toMatchObject({ alias: 'Visa BCP', archivedAt: null });
    });

    // El dueño sale del token, nunca del cuerpo: mandar otro userId no cuela, se rechaza.
    it('refuses a userId in the body instead of creating the method for someone else', async () => {
      const anaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } })).id;

      await request(server)
        .post(METHODS)
        .set('Authorization', `Bearer ${bruno}`)
        .send({ ...VISA, userId: anaId })
        .expect(422);

      await expect(prisma.paymentMethod.count()).resolves.toBe(0);
    });

    it('lets two users use the same alias', async () => {
      await create(VISA, ana);

      await expect(create(VISA, bruno)).resolves.toMatchObject({ alias: 'Visa BCP' });
    });
  });

  describe('access', () => {
    const routes = [
      ['GET', METHODS, undefined],
      ['POST', METHODS, VISA],
      ['PATCH', MISSING, { alias: 'Otro' }],
    ] as const;

    function send(method: string, path: string, body: object | undefined): request.Test {
      const call =
        method === 'GET'
          ? request(server).get(path)
          : method === 'POST'
            ? request(server).post(path)
            : request(server).patch(path);

      return body === undefined ? call : call.send(body);
    }

    it.each(routes)('%s %s requires a session', async (method, path, body) => {
      await send(method, path, body).expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it.each(routes)('%s %s refuses a personal access token', async (method, path, body) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await send(method, path, body).set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(routes)('%s %s answers 404 while the catalog is off', async (method, path, body) => {
      process.env.FEATURE_CATALOG = 'false';

      await send(method, path, body).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
