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
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const GOALS = `/${API_PREFIX}/goals`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');
const MISSING = '01999999-9999-7999-8999-000000000001';
// Hoy es 2026-10-03 en Lima.
const NOW = new Date('2026-10-03T17:00:00.000Z');

const TRIP = {
  name: 'Viaje a Cusco',
  currency: 'PEN',
  targetAmount: '1200.00',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

interface GoalBody {
  id: string;
  name: string;
  currency: string;
  targetAmount: string;
  startDate: string;
  endDate: string;
  archived: boolean;
  progress: {
    saved: string;
    remaining: string;
    excess: string;
    percentage: string;
    expectedPercentage: string;
    suggestedMonthly: string | null;
    status: string;
  };
}

interface ContributionBody {
  id: string;
  source: string;
  kind: string;
  state: string;
  amount: string | null;
  date: string | null;
  transaction: { id: string; description: string } | null;
}

describe('goals', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let savings: string;
  let groceries: string;
  let deposit: string;
  let trip: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CATALOG = 'true';
    process.env.FEATURE_TRANSACTIONS = 'true';
    process.env.FEATURE_GOALS = 'true';
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
    process.env.FEATURE_GOALS = 'true';
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
    // Nombres fuera de la semilla de categorías, o darían 409.
    savings = await create(ana, CATEGORIES, {
      name: 'Colchón',
      type: 'SAVING',
      color: '#43A047',
      icon: 'piggy-bank',
    });
    groceries = await create(ana, CATEGORIES, {
      name: 'Víveres',
      type: 'VARIABLE_EXPENSE',
      color: '#E53935',
      icon: 'cart',
    });
    deposit = await record(ana, { categoryId: savings, type: 'SAVING', amount: '500.00' });
    trip = await create(ana, GOALS, TRIP);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CATALOG;
    delete process.env.FEATURE_TRANSACTIONS;
    delete process.env.FEATURE_GOALS;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function create(session: string, path: string, body: object): Promise<string> {
    const response = await request(server)
      .post(path)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function record(
    session: string,
    fields: { categoryId: string; type: string; amount: string; currency?: string },
  ): Promise<string> {
    return create(session, TRANSACTIONS, {
      date: '2026-09-10',
      currency: 'PEN',
      description: 'Ahorro de setiembre',
      ...fields,
    });
  }

  function contribute(body: object, goalId = trip, session = ana): request.Test {
    return request(server)
      .post(`${GOALS}/${goalId}/contributions`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  function manual(kind: string, amount: string, date = '2026-09-15'): request.Test {
    return contribute({ source: 'MANUAL', kind, amount, date });
  }

  function patchGoal(body: object, goalId = trip, session = ana): request.Test {
    return request(server)
      .patch(`${GOALS}/${goalId}`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  async function goals(session = ana, query = ''): Promise<GoalBody[]> {
    const response = await request(server)
      .get(`${GOALS}${query}`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as GoalBody[];
  }

  async function tripGoal(): Promise<GoalBody | undefined> {
    return (await goals(ana, '?includeArchived=true')).find((goal) => goal.id === trip);
  }

  async function contributions(goalId = trip): Promise<ContributionBody[]> {
    const response = await request(server)
      .get(`${GOALS}/${goalId}/contributions`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    return response.body as ContributionBody[];
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  describe('a goal', () => {
    it('is created and listed with its progress, calculated today', async () => {
      const [goal] = await goals();

      expect(goal).toEqual({
        id: trip,
        ...TRIP,
        archived: false,
        progress: {
          saved: '0.00',
          remaining: '1200.00',
          excess: '0.00',
          percentage: '0',
          // Al 30 de setiembre van 273 de 365 días.
          expectedPercentage: expect.stringMatching(/^74\.794520/u) as string,
          // Octubre, noviembre y diciembre.
          suggestedMonthly: '400.00',
          status: 'AT_RISK',
        },
      });
    });

    it('lists only the goals of the account', async () => {
      await create(bruno, GOALS, { ...TRIP, name: 'Laptop' });

      expect((await goals()).map((goal) => goal.name)).toEqual(['Viaje a Cusco']);
      expect((await goals(bruno)).map((goal) => goal.name)).toEqual(['Laptop']);
    });

    it.each([
      ['a target of zero', { targetAmount: '0.00' }, 'GOAL_TARGET_NOT_POSITIVE'],
      ['a target with three decimals', { targetAmount: '10.001' }, 'INVALID_AMOUNT'],
      ['an end on its start date', { endDate: '2026-01-01' }, 'GOAL_END_NOT_AFTER_START'],
      ['a userId in the body', { userId: MISSING }, 'VALIDATION_FAILED'],
    ])('refuses %s with 422', async (_label, change, code) => {
      const response = await request(server)
        .post(GOALS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ ...TRIP, name: 'Laptop', ...change })
        .expect(422);

      expect(codeOf(response)).toBe(problemType(code));
    });

    it('refuses a name the account already uses, ignoring case, with 409', async () => {
      const response = await request(server)
        .post(GOALS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ ...TRIP, name: 'VIAJE A CUSCO' })
        .expect(409);

      expect(codeOf(response)).toBe(problemType('GOAL_NAME_TAKEN'));
    });

    it('is corrected, and its progress recalculated', async () => {
      await manual('CONTRIBUTION', '200.00').expect(201);

      const response = await patchGoal({
        name: 'Viaje a Arequipa',
        targetAmount: '1500.00',
        endDate: '2027-03-31',
      }).expect(200);
      const goal = response.body as GoalBody;

      expect(goal).toMatchObject({
        name: 'Viaje a Arequipa',
        currency: 'PEN',
        targetAmount: '1500.00',
        endDate: '2027-03-31',
      });
      // S/ 1,300.00 de octubre a marzo: 216.666… → 216.67.
      expect(goal.progress).toMatchObject({ saved: '200.00', suggestedMonthly: '216.67' });
    });

    it.each([
      ['an end before its start', { startDate: '2027-01-01' }, 422, 'GOAL_END_NOT_AFTER_START'],
      ['a negative target', { targetAmount: '-1.00' }, 422, 'GOAL_TARGET_NOT_POSITIVE'],
      ['another currency', { currency: 'USD' }, 422, 'VALIDATION_FAILED'],
      ['nothing to change', {}, 422, 'VALIDATION_FAILED'],
    ])('refuses a correction with %s', async (_label, body, status, code) => {
      const response = await patchGoal(body).expect(status);

      expect(codeOf(response)).toBe(problemType(code));
    });

    it('refuses a name another goal of the account has', async () => {
      const laptop = await create(ana, GOALS, { ...TRIP, name: 'Laptop' });

      const response = await patchGoal({ name: 'viaje a cusco' }, laptop).expect(409);

      expect(codeOf(response)).toBe(problemType('GOAL_NAME_TAKEN'));
    });

    it('is archived out of the list, still shown when asked, and restored', async () => {
      await patchGoal({ archived: true }).expect(200);

      expect(await goals()).toEqual([]);
      expect(await goals(ana, '?includeArchived=true')).toMatchObject([{ archived: true }]);

      await patchGoal({ archived: false }).expect(200);
      expect(await goals()).toMatchObject([{ archived: false }]);
    });

    it('refuses includeArchived values other than true and false', async () => {
      await request(server)
        .get(`${GOALS}?includeArchived=yes`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);
    });
  });

  describe('manual contributions and withdrawals', () => {
    it('add to what was saved, and a withdrawal takes off', async () => {
      const added = await manual('CONTRIBUTION', '300.00').expect(201);
      await manual('WITHDRAWAL', '100.00', '2026-10-03').expect(201);

      expect(added.body).toEqual({
        id: expect.any(String) as string,
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        state: 'ACTIVE',
        amount: '300.00',
        date: '2026-09-15',
        transaction: null,
      });
      expect((await tripGoal())?.progress.saved).toBe('200.00');
    });

    it('show the real percentage and the excess past the target', async () => {
      await manual('CONTRIBUTION', '1500.00').expect(201);

      expect((await tripGoal())?.progress).toMatchObject({
        percentage: '125',
        remaining: '0.00',
        excess: '300.00',
        suggestedMonthly: '0.00',
        status: 'ACHIEVED',
      });
    });

    it.each([
      [
        'a withdrawal bigger than what was saved',
        ['WITHDRAWAL', '0.01'],
        'GOAL_WITHDRAWAL_EXCEEDS_SAVED',
      ],
      ['a zero amount', ['CONTRIBUTION', '0.00'], 'GOAL_CONTRIBUTION_AMOUNT_NOT_POSITIVE'],
      ['an amount with three decimals', ['CONTRIBUTION', '1.001'], 'INVALID_AMOUNT'],
      [
        'a date after today',
        ['CONTRIBUTION', '1.00', '2026-10-04'],
        'GOAL_CONTRIBUTION_DATE_IN_FUTURE',
      ],
    ] as const)('refuse %s with 422', async (_label, [kind, amount, date], code) => {
      const response = await manual(kind, amount, date).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(contributions()).resolves.toEqual([]);
    });

    it('refuse a body with fields of both forms', async () => {
      const response = await contribute({
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: '1.00',
        date: '2026-09-15',
        transactionId: deposit,
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });

    it('are refused on an archived goal, which can still undo them', async () => {
      const added = await manual('CONTRIBUTION', '50.00').expect(201);
      await patchGoal({ archived: true }).expect(200);

      const refused = await manual('CONTRIBUTION', '50.00').expect(422);
      await request(server)
        .delete(`${GOALS}/${trip}/contributions/${(added.body as ContributionBody).id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);

      expect(codeOf(refused)).toBe(problemType('GOAL_ARCHIVED'));
      await expect(contributions()).resolves.toEqual([]);
    });

    it('are undone', async () => {
      const added = await manual('CONTRIBUTION', '300.00').expect(201);

      await request(server)
        .delete(`${GOALS}/${trip}/contributions/${(added.body as ContributionBody).id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);

      expect((await tripGoal())?.progress.saved).toBe('0.00');
    });

    it('cannot undo a contribution a withdrawal already took out', async () => {
      const added = await manual('CONTRIBUTION', '300.00').expect(201);
      await manual('WITHDRAWAL', '100.00').expect(201);

      const response = await request(server)
        .delete(`${GOALS}/${trip}/contributions/${(added.body as ContributionBody).id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);

      expect(codeOf(response)).toBe(problemType('GOAL_WITHDRAWAL_EXCEEDS_SAVED'));
    });
  });

  describe('linked contributions', () => {
    it('take the whole transaction and follow it when corrected', async () => {
      const added = await contribute({ source: 'TRANSACTION', transactionId: deposit }).expect(201);

      await request(server)
        .patch(`${TRANSACTIONS}/${deposit}`)
        .set('Authorization', `Bearer ${ana}`)
        .send({ amount: '650.00' })
        .expect(200);

      expect(added.body).toMatchObject({
        source: 'TRANSACTION',
        kind: 'CONTRIBUTION',
        state: 'ACTIVE',
        amount: '500.00',
        date: '2026-09-10',
        transaction: { id: deposit, description: 'Ahorro de setiembre' },
      });
      expect((await tripGoal())?.progress.saved).toBe('650.00');
    });

    it('stop counting while the transaction is deleted, and count again when restored', async () => {
      await contribute({ source: 'TRANSACTION', transactionId: deposit }).expect(201);

      await request(server)
        .delete(`${TRANSACTIONS}/${deposit}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);
      const whileDeleted = await contributions();
      const savedWhileDeleted = (await tripGoal())?.progress.saved;
      await request(server)
        .post(`${TRANSACTIONS}/${deposit}/restore`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);

      expect(whileDeleted).toMatchObject([
        { state: 'TRANSACTION_DELETED', amount: null, date: null, transaction: null },
      ]);
      expect(savedWhileDeleted).toBe('0.00');
      expect((await tripGoal())?.progress.saved).toBe('500.00');
    });

    it('refuse a transaction that is not a saving or an investment', async () => {
      const groceriesPurchase = await record(ana, {
        categoryId: groceries,
        type: 'VARIABLE_EXPENSE',
        amount: '80.00',
      });

      const response = await contribute({
        source: 'TRANSACTION',
        transactionId: groceriesPurchase,
      }).expect(422);

      expect(codeOf(response)).toBe(problemType('GOAL_TRANSACTION_NOT_A_SAVING'));
    });

    it('refuse a transaction in another currency', async () => {
      const dollars = await record(ana, {
        categoryId: savings,
        type: 'SAVING',
        amount: '100.00',
        currency: 'USD',
      });

      const response = await contribute({ source: 'TRANSACTION', transactionId: dollars }).expect(
        422,
      );

      expect(codeOf(response)).toBe(problemType('GOAL_CURRENCY_MISMATCH'));
    });

    it('link a transaction to a single goal', async () => {
      const laptop = await create(ana, GOALS, { ...TRIP, name: 'Laptop' });
      await contribute({ source: 'TRANSACTION', transactionId: deposit }).expect(201);

      const response = await contribute(
        { source: 'TRANSACTION', transactionId: deposit },
        laptop,
      ).expect(409);

      expect(codeOf(response)).toBe(problemType('GOAL_TRANSACTION_ALREADY_LINKED'));
    });

    it('do not find a transaction that does not exist', async () => {
      const response = await contribute({ source: 'TRANSACTION', transactionId: MISSING }).expect(
        404,
      );

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
    });
  });

  describe('another account', () => {
    it('gets 404 on every route of the goal, which stays untouched', async () => {
      const added = await manual('CONTRIBUTION', '300.00').expect(201);
      const contributionId = (added.body as ContributionBody).id;

      const patched = await patchGoal({ name: 'Mía' }, trip, bruno).expect(404);
      const listed = await request(server)
        .get(`${GOALS}/${trip}/contributions`)
        .set('Authorization', `Bearer ${bruno}`)
        .expect(404);
      const added2 = await contribute(
        { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '1.00', date: '2026-09-15' },
        trip,
        bruno,
      ).expect(404);
      const undone = await request(server)
        .delete(`${GOALS}/${trip}/contributions/${contributionId}`)
        .set('Authorization', `Bearer ${bruno}`)
        .expect(404);

      expect([patched, listed, added2, undone].map(codeOf)).toEqual(
        Array.from({ length: 4 }, () => problemType('GOAL_NOT_FOUND')),
      );
      expect(await goals(bruno)).toEqual([]);
      expect(await tripGoal()).toMatchObject({
        name: 'Viaje a Cusco',
        progress: { saved: '300.00' },
      });
    });

    it('cannot link a transaction of another account', async () => {
      const brunoGoal = await create(bruno, GOALS, TRIP);

      const response = await contribute(
        { source: 'TRANSACTION', transactionId: deposit },
        brunoGoal,
        bruno,
      ).expect(404);

      expect(codeOf(response)).toBe(problemType('TRANSACTION_NOT_FOUND'));
    });

    it('answers 404 when undoing a contribution through another goal of the same account', async () => {
      const laptop = await create(ana, GOALS, { ...TRIP, name: 'Laptop' });
      const added = await manual('CONTRIBUTION', '300.00').expect(201);

      const response = await request(server)
        .delete(`${GOALS}/${laptop}/contributions/${(added.body as ContributionBody).id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(404);

      expect(codeOf(response)).toBe(problemType('GOAL_CONTRIBUTION_NOT_FOUND'));
      await expect(contributions()).resolves.toHaveLength(1);
    });
  });

  it.each([
    ['PATCH', () => patchGoal({ name: 'x' }, '42')],
    [
      'GET contributions',
      () => request(server).get(`${GOALS}/42/contributions`).set('Authorization', `Bearer ${ana}`),
    ],
    [
      'DELETE contribution',
      () =>
        request(server)
          .delete(`${GOALS}/${MISSING}/contributions/42`)
          .set('Authorization', `Bearer ${ana}`),
    ],
  ])('%s answers 422, not 500, to an id that is not a UUID', async (_label, send) => {
    await send().expect(422);
  });

  describe('access', () => {
    const routes = [
      ['GET goals', () => request(server).get(GOALS)],
      ['POST goals', () => request(server).post(GOALS).send(TRIP)],
      ['PATCH goal', () => request(server).patch(`${GOALS}/${MISSING}`).send({ name: 'x' })],
      ['GET contributions', () => request(server).get(`${GOALS}/${MISSING}/contributions`)],
      [
        'POST contribution',
        () =>
          request(server)
            .post(`${GOALS}/${MISSING}/contributions`)
            .send({ source: 'TRANSACTION', transactionId: MISSING }),
      ],
      [
        'DELETE contribution',
        () => request(server).delete(`${GOALS}/${MISSING}/contributions/${MISSING}`),
      ],
    ] as const;

    it.each(routes)('%s requires a session', async (_method, send) => {
      await send().expect(401);
    });

    // Un token personal solo sirve para mandar capturas desde el celular.
    it.each(routes)('%s refuses a personal access token', async (_method, send) => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await send().set('Authorization', `Bearer ${token}`).expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it.each(routes)('%s answers 404 while the goals are off', async (_method, send) => {
      process.env.FEATURE_GOALS = 'false';

      await send().set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
