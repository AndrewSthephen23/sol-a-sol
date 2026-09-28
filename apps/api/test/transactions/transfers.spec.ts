import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LocalDate, PERU_TIME_ZONE } from '@sol-a-sol/domain';
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
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const TRANSFERS = `/${API_PREFIX}/transfers`;
const MISSING_ID = '01999999-9999-7999-8999-999999999999';
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface TransferBody {
  id: string;
  date: string;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  amount: string;
  currency: string;
  receivedAmount: string;
  receivedCurrency: string;
  description: string;
  source: string;
}

/** Las cuentas de Ana. */
interface Accounts {
  digital: string;
  yape: string;
  dollars: string;
}

describe('transfers', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let accounts: Accounts;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_TRANSACTIONS = 'true';
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
    process.env.FEATURE_TRANSACTIONS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    accounts = {
      digital: await methodOf(ana, account('BCP Digital Soles', 'BCP', 'PEN')),
      yape: await methodOf(ana, account('BCP Yape Soles', 'BCP', 'PEN')),
      dollars: await methodOf(ana, account('Interbank Simple Dólares', 'Interbank', 'USD')),
    };
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  function account(alias: string, institution: string, currency: string): object {
    return { kind: 'ACCOUNT', alias, institution, currency };
  }

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function methodOf(session: string, body: object): Promise<string> {
    const response = await request(server)
      .post(METHODS)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  /** De la cuenta Digital a Yape, en soles. */
  function toYape(): Record<string, unknown> {
    return {
      date: '2026-09-01',
      fromPaymentMethodId: accounts.digital,
      toPaymentMethodId: accounts.yape,
      amount: '50.00',
      description: 'Paso a Yape',
    };
  }

  function post(body: object, session = ana): request.Test {
    return request(server).post(TRANSFERS).set('Authorization', `Bearer ${session}`).send(body);
  }

  async function register(body: object = toYape()): Promise<TransferBody> {
    const response = await post(body).expect(201);

    return response.body as TransferBody;
  }

  function get(id: string, session = ana): request.Test {
    return request(server).get(`${TRANSFERS}/${id}`).set('Authorization', `Bearer ${session}`);
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  /** Los montos tal como quedaron en las columnas, sin pasar por Prisma ni por `number`. */
  async function storedAmounts(id: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ amount: string; received: string }[]>`
      SELECT amount::text AS amount, received_amount::text AS received
        FROM transfers WHERE id = ${id}::uuid`;
    const [row] = rows;
    if (row === undefined) throw new Error(`Transfer ${id} is not in the table.`);

    return [row.amount, row.received];
  }

  describe('registering one', () => {
    it('moves the money in the same currency, as MANUAL', async () => {
      const created = await register();

      expect(created).toMatchObject({
        date: '2026-09-01',
        fromPaymentMethodId: accounts.digital,
        toPaymentMethodId: accounts.yape,
        amount: '50.00',
        currency: 'PEN',
        receivedAmount: '50.00',
        receivedCurrency: 'PEN',
        description: 'Paso a Yape',
        source: 'MANUAL',
      });
      expect(created).not.toHaveProperty('userId');
    });

    it('keeps both amounts of a currency change exact down to the columns', async () => {
      const created = await register({
        ...toYape(),
        toPaymentMethodId: accounts.dollars,
        amount: '37.51',
        receivedAmount: '10.03',
      });

      expect(created).toMatchObject({
        amount: '37.51',
        currency: 'PEN',
        receivedAmount: '10.03',
        receivedCurrency: 'USD',
      });
      await expect(storedAmounts(created.id)).resolves.toEqual(['37.51', '10.03']);
    });

    // No es ingreso ni gasto: el listado de transacciones y sus totales no cambian.
    it('leaves the totals of the transactions as they were', async () => {
      await register();

      const response = await request(server)
        .get(TRANSACTIONS)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);

      expect(response.body).toEqual({ items: [], nextCursor: null, totals: [] });
    });

    describe('is rejected with 422', () => {
      it.each([
        [
          'the same account on both sides',
          () => ({ toPaymentMethodId: accounts.digital }),
          'TRANSFER_SAME_ACCOUNT',
        ],
        [
          'a currency change without the amount received',
          () => ({ toPaymentMethodId: accounts.dollars }),
          'TRANSFER_RECEIVED_AMOUNT_REQUIRED',
        ],
        [
          'a different amount received in the same currency',
          () => ({ receivedAmount: '49.00' }),
          'TRANSFER_RECEIVED_AMOUNT_MISMATCH',
        ],
        [
          'a currency the account does not hold',
          () => ({ currency: 'USD' }),
          'TRANSFER_CURRENCY_MISMATCH',
        ],
        ['a zero amount', () => ({ amount: '0' }), 'TRANSFER_AMOUNT_NOT_POSITIVE'],
        ['a third decimal', () => ({ amount: '50.005' }), 'INVALID_AMOUNT'],
        [
          'a category, which a transfer does not have',
          () => ({ categoryId: MISSING_ID }),
          'VALIDATION_FAILED',
        ],
      ])('for %s', async (_case, change, code) => {
        const response = await post({ ...toYape(), ...change() }).expect(422);

        expect(codeOf(response)).toBe(problemType(code));
        await expect(prisma.transfer.count()).resolves.toBe(0);
      });

      it('for a date in the future', async () => {
        const later = LocalDate.fromInstant(new Date(), PERU_TIME_ZONE).plusDays(2).toString();

        const response = await post({ ...toYape(), date: later }).expect(422);

        expect(codeOf(response)).toBe(problemType('TRANSACTION_DATE_IN_FUTURE'));
      });

      it('for an archived account', async () => {
        await request(server)
          .patch(`${METHODS}/${accounts.yape}`)
          .set('Authorization', `Bearer ${ana}`)
          .send({ archived: true })
          .expect(200);

        const response = await post(toYape()).expect(422);

        expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_ARCHIVED'));
      });
    });

    // 404 y no 403: no se confirma que la cuenta de otra persona existe.
    it.each(['fromPaymentMethodId', 'toPaymentMethodId'])(
      'does not find a %s of another account',
      async (field) => {
        const hers = await methodOf(bruno, account('Cuenta de Bruno', 'BCP', 'PEN'));

        const response = await post({ ...toYape(), [field]: hers }).expect(404);

        expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
      },
    );
  });

  describe('reading one', () => {
    it('returns an own transfer as it was registered', async () => {
      const created = await register();

      const response = await get(created.id).expect(200);

      expect(response.body).toEqual(created);
    });

    it.each([
      ['another account', (id: string) => get(id, bruno)],
      ['a missing id', () => get(MISSING_ID)],
      ['an id that is not a UUID', () => get('42')],
    ])('answers 404 for %s', async (_case, read) => {
      const created = await register();

      const response = await read(created.id).expect(404);

      expect(codeOf(response)).toBe(problemType('TRANSFER_NOT_FOUND'));
    });

    it('answers 404 for a deleted transfer', async () => {
      const created = await register();
      await prisma.transfer.update({ where: { id: created.id }, data: { deletedAt: new Date() } });

      await get(created.id).expect(404);
    });
  });

  describe('the table', () => {
    // Red por si alguien se salta el dominio: las reglas también viven en la base.
    it.each([
      ['the same account on both sides', (id: string) => ({ toPaymentMethodId: id })],
      ['a different amount in the same currency', () => ({ receivedAmount: '49.00' })],
      ['a negative amount', () => ({ amount: '-50.00', receivedAmount: '-50.00' })],
    ])('refuses %s', async (_case, change) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });

      await expect(
        prisma.transfer.create({
          data: {
            userId: user.id,
            date: new Date('2026-09-01T00:00:00.000Z'),
            fromPaymentMethodId: accounts.digital,
            toPaymentMethodId: accounts.yape,
            amount: '50.00',
            currency: 'PEN',
            receivedAmount: '50.00',
            receivedCurrency: 'PEN',
            description: 'Directo a la base',
            source: 'MANUAL',
            ...change(accounts.digital),
          },
        }),
      ).rejects.toThrow();
    });

    it('refuses an account of another user, even knowing its id', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      const hers = await methodOf(bruno, account('Cuenta de Bruno', 'BCP', 'PEN'));

      await expect(
        prisma.transfer.create({
          data: {
            userId: user.id,
            date: new Date('2026-09-01T00:00:00.000Z'),
            fromPaymentMethodId: accounts.digital,
            toPaymentMethodId: hers,
            amount: '50.00',
            currency: 'PEN',
            receivedAmount: '50.00',
            receivedCurrency: 'PEN',
            description: 'Directo a la base',
            source: 'MANUAL',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('access', () => {
    const routes = [
      ['POST', TRANSFERS],
      ['GET', `${TRANSFERS}/${MISSING_ID}`],
    ] as const;

    function send(method: string, path: string): request.Test {
      return method === 'GET'
        ? request(server).get(path)
        : request(server).post(path).send(toYape());
    }

    it.each(routes)('%s %s requires a session', async (method, path) => {
      await send(method, path).expect(401);
    });

    it.each(routes)('%s %s refuses a personal access token', async (method, path) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await send(method, path).set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(routes)('%s %s answers 404 while transactions is off', async (method, path) => {
      process.env.FEATURE_TRANSACTIONS = 'false';

      await send(method, path).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
