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
const CATEGORIES = `/${API_PREFIX}/categories`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const MISSING_ID = '01999999-9999-7999-8999-999999999999';
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface TransactionBody {
  id: string;
  date: string;
  type: string;
  categoryId: string;
  amount: string;
  currency: string;
  description: string;
  paymentMethodId: string | null;
  merchant: string | null;
  source: string;
  captureId: string | null;
}

/** Lo que Ana tiene en su catálogo para registrar. */
interface Catalog {
  food: string;
  rent: string;
  salary: string;
  payroll: string;
  visa: string;
}

describe('transactions', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let catalog: Catalog;

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
    catalog = {
      food: await categoryOf(ana, { name: 'Almuerzos', type: 'VARIABLE_EXPENSE' }),
      rent: await categoryOf(ana, { name: 'Alquiler', type: 'FIXED_EXPENSE' }),
      salary: await categoryOf(ana, { name: 'Planilla', type: 'INCOME' }),
      payroll: await methodOf(ana, {
        kind: 'ACCOUNT',
        alias: 'Sueldo BCP',
        institution: 'BCP',
        currency: 'PEN',
      }),
      visa: await methodOf(ana, {
        kind: 'CREDIT_CARD',
        alias: 'Visa Interbank',
        institution: 'Interbank',
        last4: '4242',
      }),
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

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function categoryOf(session: string, body: object): Promise<string> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function methodOf(session: string, body: object): Promise<string> {
    const response = await request(server)
      .post(METHODS)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  /** Un almuerzo pagado con la cuenta sueldo, en una fecha que ya pasó. */
  function lunch(): Record<string, unknown> {
    return {
      date: '2026-09-01',
      type: 'VARIABLE_EXPENSE',
      categoryId: catalog.food,
      amount: '25.90',
      description: 'Almuerzo',
      paymentMethodId: catalog.payroll,
      merchant: 'TAMBO',
    };
  }

  function post(body: object, session = ana): request.Test {
    return request(server).post(TRANSACTIONS).set('Authorization', `Bearer ${session}`).send(body);
  }

  async function register(body: object = lunch()): Promise<TransactionBody> {
    const response = await post(body).expect(201);

    return response.body as TransactionBody;
  }

  function get(id: string, session = ana): request.Test {
    return request(server).get(`${TRANSACTIONS}/${id}`).set('Authorization', `Bearer ${session}`);
  }

  function patch(id: string, body: object, session = ana): request.Test {
    return request(server)
      .patch(`${TRANSACTIONS}/${id}`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  function remove(id: string, session = ana): request.Test {
    return request(server)
      .delete(`${TRANSACTIONS}/${id}`)
      .set('Authorization', `Bearer ${session}`);
  }

  function restore(id: string, session = ana): request.Test {
    return request(server)
      .post(`${TRANSACTIONS}/${id}/restore`)
      .set('Authorization', `Bearer ${session}`);
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  /** El monto tal como quedó en la columna, sin pasar por Prisma ni por `number`. */
  async function storedAmount(id: string): Promise<string> {
    const rows = await prisma.$queryRaw<{ amount: string }[]>`
      SELECT amount::text AS amount FROM transactions WHERE id = ${id}::uuid`;

    const [row] = rows;
    if (row === undefined) throw new Error(`Transaction ${id} is not in the table.`);

    return row.amount;
  }

  describe('registering one', () => {
    it('saves it as MANUAL, with the amount as a decimal string', async () => {
      const created = await register();

      expect(created).toMatchObject({
        date: '2026-09-01',
        type: 'VARIABLE_EXPENSE',
        categoryId: catalog.food,
        amount: '25.90',
        currency: 'PEN',
        description: 'Almuerzo',
        paymentMethodId: catalog.payroll,
        merchant: 'TAMBO',
        source: 'MANUAL',
        captureId: null,
      });
      expect(created).not.toHaveProperty('userId');
      expect(created).not.toHaveProperty('deletedAt');
    });

    // Un `number` habría perdido los céntimos: 1234567890123.45 no cabe exacto en un double.
    it.each(['25.90', '0.01', '1234567890123.45'])(
      'keeps %s exact down to the NUMERIC(18,2) column',
      async (amount) => {
        const created = await register({ ...lunch(), amount });

        expect(created.amount).toBe(amount);
        await expect(storedAmount(created.id)).resolves.toBe(amount);
      },
    );

    it('writes whole amounts with their two decimals', async () => {
      const created = await register({ ...lunch(), amount: '25' });

      expect(created.amount).toBe('25.00');
    });

    it('takes the currency of the payment method when none is sent', async () => {
      await expect(register()).resolves.toMatchObject({ currency: 'PEN' });
    });

    it('keeps the currency sent', async () => {
      await expect(register({ ...lunch(), currency: 'USD' })).resolves.toMatchObject({
        currency: 'USD',
      });
    });

    it('needs neither a payment method nor a merchant', async () => {
      const created = await register({
        ...lunch(),
        paymentMethodId: null,
        merchant: null,
        currency: 'USD',
      });

      expect(created).toMatchObject({ paymentMethodId: null, merchant: null, currency: 'USD' });
    });

    it('accepts a subcategory', async () => {
      const response = await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'Menú del día', parentId: catalog.food })
        .expect(201);
      const { id } = response.body as { id: string };

      await expect(register({ ...lunch(), categoryId: id })).resolves.toMatchObject({
        categoryId: id,
      });
    });

    it('accepts today in Lima', async () => {
      const today = LocalDate.fromInstant(new Date(), PERU_TIME_ZONE).toString();

      await expect(register({ ...lunch(), date: today })).resolves.toMatchObject({ date: today });
    });

    describe('is rejected with 422', () => {
      it.each([
        ['a third decimal, instead of rounding it', { amount: '25.905' }, 'INVALID_AMOUNT'],
        ['a zero amount', { amount: '0' }, 'TRANSACTION_AMOUNT_NOT_POSITIVE'],
        ['a negative amount', { amount: '-25.90' }, 'TRANSACTION_AMOUNT_NOT_POSITIVE'],
        ['an amount sent as a number', { amount: 25.9 }, 'VALIDATION_FAILED'],
        ['a source in the body', { source: 'IMPORT' }, 'VALIDATION_FAILED'],
        ['a userId in the body', { userId: MISSING_ID }, 'VALIDATION_FAILED'],
      ])('for %s', async (_case, change, code) => {
        const response = await post({ ...lunch(), ...change }).expect(422);

        expect(codeOf(response)).toBe(problemType(code));
      });

      it('for a date in the future, in the hour of Lima', async () => {
        const later = LocalDate.fromInstant(new Date(), PERU_TIME_ZONE).plusDays(2).toString();

        const response = await post({ ...lunch(), date: later }).expect(422);

        expect(codeOf(response)).toBe(problemType('TRANSACTION_DATE_IN_FUTURE'));
      });

      it('for a category of another type', async () => {
        const response = await post({ ...lunch(), categoryId: catalog.salary }).expect(422);

        expect(codeOf(response)).toBe(problemType('CATEGORY_TYPE_MISMATCH'));
      });

      it('for an archived category', async () => {
        await request(server)
          .patch(`${CATEGORIES}/${catalog.food}`)
          .set('Authorization', `Bearer ${ana}`)
          .send({ archived: true })
          .expect(200);

        const response = await post(lunch()).expect(422);

        expect(codeOf(response)).toBe(problemType('CATEGORY_ARCHIVED'));
      });

      it('for an archived payment method', async () => {
        await request(server)
          .patch(`${METHODS}/${catalog.payroll}`)
          .set('Authorization', `Bearer ${ana}`)
          .send({ archived: true })
          .expect(200);

        const response = await post(lunch()).expect(422);

        expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_ARCHIVED'));
      });

      it('for a dual-currency card without a currency', async () => {
        const response = await post({ ...lunch(), paymentMethodId: catalog.visa }).expect(422);

        expect(codeOf(response)).toBe(problemType('TRANSACTION_CURRENCY_REQUIRED'));
      });

      it('and saves nothing', async () => {
        await post({ ...lunch(), amount: '0' }).expect(422);

        await expect(prisma.transaction.count()).resolves.toBe(0);
      });
    });

    // 404 y no 403: un 403 confirmaría que la categoría o el método existen.
    describe('does not find what belongs to another account', () => {
      it('a category', async () => {
        const hers = await categoryOf(bruno, { name: 'Almuerzos', type: 'VARIABLE_EXPENSE' });

        const response = await post({ ...lunch(), categoryId: hers }).expect(404);

        expect(codeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      });

      it('a payment method', async () => {
        const hers = await methodOf(bruno, { kind: 'CASH', alias: 'Efectivo' });

        const response = await post({ ...lunch(), paymentMethodId: hers }).expect(404);

        expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
      });

      it('nor one that does not exist', async () => {
        await post({ ...lunch(), categoryId: MISSING_ID }).expect(404);
        await post({ ...lunch(), paymentMethodId: MISSING_ID }).expect(404);
      });
    });
  });

  describe('reading one', () => {
    it('returns an own transaction as it was registered', async () => {
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

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
    });

    it('answers 404 for a deleted transaction', async () => {
      const created = await register();
      await prisma.transaction.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      await get(created.id).expect(404);
    });
  });

  describe('correcting one', () => {
    it('changes only what was sent', async () => {
      const created = await register();

      const response = await patch(created.id, { description: 'Menú', merchant: null }).expect(200);

      expect(response.body).toMatchObject({
        ...created,
        description: 'Menú',
        merchant: null,
        updatedAt: expect.any(String) as string,
      });
    });

    it('keeps the new amount exact down to the column', async () => {
      const created = await register();

      await patch(created.id, { amount: '1234567890123.47' }).expect(200);

      await expect(storedAmount(created.id)).resolves.toBe('1234567890123.47');
    });

    it('changes the currency only when it is sent', async () => {
      const created = await register();
      const cash = await methodOf(ana, { kind: 'CASH', alias: 'Efectivo' });

      const kept = await patch(created.id, { paymentMethodId: cash }).expect(200);
      const changed = await patch(created.id, { currency: 'USD' }).expect(200);

      expect(kept.body).toMatchObject({ paymentMethodId: cash, currency: 'PEN' });
      expect(changed.body).toMatchObject({ amount: '25.90', currency: 'USD' });
    });

    it('moves it to a day of a past month', async () => {
      const created = await register();

      await expect(patch(created.id, { date: '2025-12-31' }).expect(200)).resolves.toMatchObject({
        body: { date: '2025-12-31' },
      });
    });

    it('changes the type together with a category of that type', async () => {
      const created = await register();

      const response = await patch(created.id, {
        type: 'FIXED_EXPENSE',
        categoryId: catalog.rent,
      }).expect(200);

      expect(response.body).toMatchObject({ type: 'FIXED_EXPENSE', categoryId: catalog.rent });
    });

    // Una importada sigue diciendo que vino de un CSV aunque se corrija a mano.
    it('keeps where it came from', async () => {
      const created = await register();
      await prisma.transaction.update({ where: { id: created.id }, data: { source: 'IMPORT' } });

      const response = await patch(created.id, { amount: '30.00' }).expect(200);

      expect(response.body).toMatchObject({ source: 'IMPORT', amount: '30.00' });
    });

    // Una categoría archivada sigue en las transacciones viejas, y corregirlas no obliga a sacarlas.
    it('keeps working on a transaction whose category was archived later', async () => {
      const created = await register();
      await request(server)
        .patch(`${CATEGORIES}/${catalog.food}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ archived: true })
        .expect(200);

      await patch(created.id, { amount: '26.00' }).expect(200);
    });

    describe('is rejected with 422', () => {
      it.each([
        ['changing the type alone', { type: 'FIXED_EXPENSE' }, 'CATEGORY_TYPE_MISMATCH'],
        ['a third decimal', { amount: '25.905' }, 'INVALID_AMOUNT'],
        ['a zero amount', { amount: '0' }, 'TRANSACTION_AMOUNT_NOT_POSITIVE'],
        ['a source in the body', { source: 'MANUAL' }, 'VALIDATION_FAILED'],
        ['an empty change', {}, 'VALIDATION_FAILED'],
      ])('for %s', async (_case, body, code) => {
        const created = await register();

        const response = await patch(created.id, body).expect(422);

        expect(codeOf(response)).toBe(problemType(code));
        await expect(get(created.id).expect(200)).resolves.toMatchObject({ body: created });
      });

      it('for a new date in the future', async () => {
        const created = await register();
        const later = LocalDate.fromInstant(new Date(), PERU_TIME_ZONE).plusDays(2).toString();

        const response = await patch(created.id, { date: later }).expect(422);

        expect(codeOf(response)).toBe(problemType('TRANSACTION_DATE_IN_FUTURE'));
      });
    });

    describe('answers 404', () => {
      it('for the transaction of another account, and leaves it as it was', async () => {
        const created = await register();

        const response = await patch(created.id, { amount: '1.00' }, bruno).expect(404);

        expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
        await expect(storedAmount(created.id)).resolves.toBe('25.90');
      });

      it('for a deleted transaction', async () => {
        const created = await register();
        await remove(created.id).expect(204);

        await patch(created.id, { amount: '1.00' }).expect(404);
      });

      it('for a category of another account', async () => {
        const created = await register();
        const hers = await categoryOf(bruno, { name: 'Almuerzos', type: 'VARIABLE_EXPENSE' });

        const response = await patch(created.id, { categoryId: hers }).expect(404);

        expect(codeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      });

      it('for a payment method of another account', async () => {
        const created = await register();
        const hers = await methodOf(bruno, { kind: 'CASH', alias: 'Efectivo' });

        const response = await patch(created.id, { paymentMethodId: hers }).expect(404);

        expect(codeOf(response)).toBe(problemType('PAYMENT_METHOD_NOT_FOUND'));
      });
    });
  });

  describe('deleting one', () => {
    it('stops showing it, but keeps the row for the audit', async () => {
      const created = await register();

      await remove(created.id).expect(204);

      await get(created.id).expect(404);
      const row = await prisma.transaction.findUnique({ where: { id: created.id } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });

    it('answers 404 the second time', async () => {
      const created = await register();
      await remove(created.id).expect(204);

      const response = await remove(created.id).expect(404);

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
    });

    it('does not delete the transaction of another account', async () => {
      const created = await register();

      await remove(created.id, bruno).expect(404);

      await get(created.id).expect(200);
    });
  });

  describe('restoring one', () => {
    it('brings it back as it was', async () => {
      const created = await register();
      await remove(created.id).expect(204);

      const response = await restore(created.id).expect(200);

      expect(response.body).toMatchObject({ ...created, updatedAt: expect.any(String) as string });
      await get(created.id).expect(200);
    });

    // Sin plazo: el aviso de unos segundos es cosa de la interfaz.
    it('works long after the deletion', async () => {
      const created = await register();
      await prisma.transaction.update({
        where: { id: created.id },
        data: { deletedAt: new Date('2026-01-01T00:00:00.000Z') },
      });

      await restore(created.id).expect(200);
    });

    // Un doble clic en «Deshacer» no es un error.
    it('returns a transaction that is not deleted as it is', async () => {
      const created = await register();

      const response = await restore(created.id).expect(200);

      expect(response.body).toEqual(created);
    });

    it('does not restore the transaction of another account', async () => {
      const created = await register();
      await remove(created.id).expect(204);

      const response = await restore(created.id, bruno).expect(404);

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
      await get(created.id).expect(404);
    });

    it.each([MISSING_ID, '42'])('answers 404 for the id %s', async (id) => {
      await restore(id).expect(404);
    });
  });

  describe('access', () => {
    const one = `${TRANSACTIONS}/${MISSING_ID}`;
    const routes = [
      ['POST', TRANSACTIONS],
      ['GET', one],
      ['PATCH', one],
      ['DELETE', one],
      ['POST', `${one}/restore`],
    ] as const;

    function send(method: string, path: string): request.Test {
      switch (method) {
        case 'GET':
          return request(server).get(path);
        case 'PATCH':
          return request(server).patch(path).send({ description: 'Menú' });
        case 'DELETE':
          return request(server).delete(path);
        default:
          return request(server).post(path).send(lunch());
      }
    }

    it.each(routes)('%s %s requires a session', async (method, path) => {
      await send(method, path).expect(401);
    });

    // El celular registra por `/captures` (H7): un token personal no llega aquí.
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
