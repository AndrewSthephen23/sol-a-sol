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
const CATEGORIES = `/${API_PREFIX}/categories`;
const SEPTEMBER = `/${API_PREFIX}/budgets/2026/9`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface BudgetBody {
  year: number;
  month: number;
  lines: { categoryId: string; type: string; plannedAmount: string; currency: string }[];
}

interface CategoryBody {
  id: string;
  name: string;
  type: string;
  children: { id: string; name: string }[];
}

describe('budgets', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  /** Categorías de Ana creadas para estas pruebas (la semilla usa otros nombres). */
  let groceries: string;
  let delivery: string;
  let wages: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_BUDGETING = 'true';
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
    process.env.FEATURE_BUDGETING = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    groceries = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' });
    delivery = await category({ name: 'A domicilio', parentId: groceries });
    wages = await category({ name: 'Honorarios', type: 'INCOME' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_BUDGETING;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function category(body: object, session = ana): Promise<string> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send({ color: '#1E88E5', icon: 'tag', ...body })
      .expect(201);

    return (response.body as CategoryBody).id;
  }

  function put(body: object, session = ana, path = SEPTEMBER): request.Test {
    return request(server).put(path).set('Authorization', `Bearer ${session}`).send(body);
  }

  async function read(session = ana, path = SEPTEMBER): Promise<BudgetBody> {
    const response = await request(server)
      .get(path)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as BudgetBody;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  function line(categoryId: string, plannedAmount = '800.00', currency = 'PEN') {
    return { categoryId, plannedAmount, currency };
  }

  describe('reading a month', () => {
    it('answers a month without a budget with no lines, not a 404', async () => {
      await expect(read()).resolves.toEqual({ year: 2026, month: 9, lines: [] });
    });

    it('refuses a month that does not exist, saying why', async () => {
      const response = await request(server)
        .get(`/${API_PREFIX}/budgets/2026/13`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);

      expect(codeOf(response)).toBe(problemType('BUDGET_MONTH_INVALID'));
    });

    it('refuses a month that is not a number', async () => {
      const response = await request(server)
        .get(`/${API_PREFIX}/budgets/2026/sep`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });
  });

  describe('saving a month', () => {
    it('saves the lines with the type of their category, exact down to the column', async () => {
      const response = await put({
        lines: [
          line(groceries, '1234567890123456.78'),
          line(groceries, '50.5', 'USD'),
          line(wages, '4000'),
        ],
      }).expect(200);

      const expected = {
        year: 2026,
        month: 9,
        lines: [
          {
            categoryId: groceries,
            type: 'VARIABLE_EXPENSE',
            plannedAmount: '1234567890123456.78',
            currency: 'PEN',
          },
          {
            categoryId: groceries,
            type: 'VARIABLE_EXPENSE',
            plannedAmount: '50.50',
            currency: 'USD',
          },
          { categoryId: wages, type: 'INCOME', plannedAmount: '4000.00', currency: 'PEN' },
        ],
      };
      expect(response.body).toEqual(expected);
      await expect(read()).resolves.toEqual(expected);
    });

    it('replaces the whole month, is idempotent, and an empty list empties it', async () => {
      await put({ lines: [line(groceries)] }).expect(200);
      await put({ lines: [line(wages, '1')] }).expect(200);
      await put({ lines: [line(wages, '1')] }).expect(200);
      expect((await read()).lines).toEqual([
        { categoryId: wages, type: 'INCOME', plannedAmount: '1.00', currency: 'PEN' },
      ]);

      await put({ lines: [] }).expect(200);
      expect((await read()).lines).toEqual([]);
      await expect(prisma.budgetLine.count()).resolves.toBe(0);
    });

    it('keeps each month apart, past and future alike, with zero allowed', async () => {
      await put({ lines: [line(groceries, '0')] }, ana, `/${API_PREFIX}/budgets/2025/1`).expect(
        200,
      );
      await put({ lines: [line(groceries, '10')] }, ana, `/${API_PREFIX}/budgets/2027/12`).expect(
        200,
      );

      expect((await read(ana, `/${API_PREFIX}/budgets/2025/1`)).lines[0]?.plannedAmount).toBe(
        '0.00',
      );
      expect((await read(ana, `/${API_PREFIX}/budgets/2027/12`)).lines[0]?.plannedAmount).toBe(
        '10.00',
      );
      expect((await read()).lines).toEqual([]);
    });

    it.each([
      ['a negative amount', () => [line(groceries, '-1')], 'BUDGET_AMOUNT_NEGATIVE'],
      ['a third decimal, never rounded', () => [line(groceries, '800.005')], 'INVALID_AMOUNT'],
      ['a subcategory', () => [line(delivery)], 'BUDGET_CATEGORY_NOT_TOP_LEVEL'],
      [
        'the same category twice in a currency',
        () => [line(groceries), line(groceries, '1')],
        'BUDGET_LINE_DUPLICATED',
      ],
    ])('refuses %s with 422 and saves nothing', async (_case, lines, code) => {
      await put({ lines: [line(wages)] }).expect(200);

      const response = await put({ lines: lines() }).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      expect((await read()).lines).toHaveLength(1);
    });

    it('refuses an archived category for a new line, but keeps one the month already had', async () => {
      await put({ lines: [line(groceries)] }).expect(200);
      await request(server)
        .patch(`${CATEGORIES}/${groceries}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ archived: true })
        .expect(200);

      await put({ lines: [line(groceries, '900')] }).expect(200);
      const response = await put(
        { lines: [line(groceries)] },
        ana,
        `/${API_PREFIX}/budgets/2026/10`,
      ).expect(422);

      expect(codeOf(response)).toBe(problemType('CATEGORY_ARCHIVED'));
      expect((await read()).lines[0]?.plannedAmount).toBe('900.00');
    });

    it.each([
      ['an amount as a number', { lines: [{ ...line('x'), plannedAmount: 800 }] }],
      ['a type chosen by the caller', { lines: [{ ...line('x'), type: 'INCOME' }] }],
      ['a userId in the body', { lines: [], userId: 'someone' }],
    ])('refuses %s instead of ignoring it', async (_case, body) => {
      const response = await put(body).expect(422);

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });
  });

  describe('user isolation (anti-IDOR)', () => {
    it('answers 404 for a category of another account, and saves nothing', async () => {
      const hers = await category({ name: 'Víveres', type: 'VARIABLE_EXPENSE' }, bruno);

      const response = await put({ lines: [line(hers)] }).expect(404);

      expect(codeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      await expect(prisma.budgetLine.count()).resolves.toBe(0);
    });

    it('never shows nor touches the budget of another account for the same month', async () => {
      await put({ lines: [line(groceries)] }).expect(200);

      await expect(read(bruno)).resolves.toEqual({ year: 2026, month: 9, lines: [] });
      await put({ lines: [] }, bruno).expect(200);

      expect((await read()).lines).toHaveLength(1);
    });
  });

  describe('access', () => {
    const routes = [
      ['GET', undefined],
      ['PUT', { lines: [] }],
    ] as const;

    function send(method: string, body: object | undefined): request.Test {
      return method === 'GET'
        ? request(server).get(SEPTEMBER)
        : request(server).put(SEPTEMBER).send(body);
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
    it.each(routes)('%s answers 404 while the budget is off', async (method, body) => {
      process.env.FEATURE_BUDGETING = 'false';

      await send(method, body).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
