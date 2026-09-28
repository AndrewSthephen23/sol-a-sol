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
const CATEGORIES = `/${API_PREFIX}/categories`;
const METHODS = `/${API_PREFIX}/payment-methods`;
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const TRANSFERS = `/${API_PREFIX}/transfers`;
const TAGS = `/${API_PREFIX}/tags`;
const TOKENS = `/${API_PREFIX}/tokens`;
const MISSING_ID = '01999999-9999-7999-8999-999999999999';
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface TransactionBody {
  id: string;
  amount: string;
  tags: string[];
}

interface ListBody {
  items: { kind: string; id: string; tags?: string[] }[];
  totals: { currency: string; expense: string }[];
}

describe('tags', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let anaFood: string;
  let brunoFood: string;

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
    anaFood = await categoryOf(ana);
    brunoFood = await categoryOf(bruno);
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

  async function categoryOf(session: string): Promise<string> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send({ name: 'Almuerzos', type: 'VARIABLE_EXPENSE' })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function post(body: object, session = ana): request.Test {
    return request(server).post(TRANSACTIONS).set('Authorization', `Bearer ${session}`).send(body);
  }

  async function register(
    change: Record<string, unknown> = {},
    session = ana,
  ): Promise<TransactionBody> {
    const response = await post(
      {
        date: '2026-09-01',
        type: 'VARIABLE_EXPENSE',
        categoryId: session === ana ? anaFood : brunoFood,
        amount: '10.00',
        currency: 'PEN',
        description: 'Menú',
        ...change,
      },
      session,
    ).expect(201);

    return response.body as TransactionBody;
  }

  function patch(id: string, body: object): request.Test {
    return request(server)
      .patch(`${TRANSACTIONS}/${id}`)
      .set('Authorization', `Bearer ${ana}`)
      .send(body);
  }

  async function listed(query: Record<string, string>, session = ana): Promise<ListBody> {
    const response = await request(server)
      .get(TRANSACTIONS)
      .query(query)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as ListBody;
  }

  interface TagBody {
    id: string;
    name: string;
    transactionCount: number;
  }

  async function tagList(session = ana): Promise<TagBody[]> {
    const response = await request(server)
      .get(TAGS)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as TagBody[];
  }

  async function tagId(name: string, session = ana): Promise<string> {
    const found = (await tagList(session)).find((tag) => tag.name === name);
    if (found === undefined) throw new Error(`No tag ${name}`);

    return found.id;
  }

  function renameTag(id: string, name: string, session = ana): request.Test {
    return request(server)
      .patch(`${TAGS}/${id}`)
      .set('Authorization', `Bearer ${session}`)
      .send({ name });
  }

  function deleteTag(id: string, session = ana): request.Test {
    return request(server).delete(`${TAGS}/${id}`).set('Authorization', `Bearer ${session}`);
  }

  async function tagsOfTransaction(id: string): Promise<string[]> {
    const response = await request(server)
      .get(`${TRANSACTIONS}/${id}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    return (response.body as TransactionBody).tags;
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  async function tagsOf(email: string): Promise<string[]> {
    const rows = await prisma.tag.findMany({ where: { user: { email } }, select: { name: true } });

    // En español, como las ordena la API (la base pondría las mayúsculas primero).
    return rows.map((row) => row.name).toSorted((a, b) => a.localeCompare(b, 'es'));
  }

  describe('registering with tags', () => {
    it('answers them in alphabetical order', async () => {
      const created = await register({ tags: ['oficina', 'Almuerzo'] });

      expect(created.tags).toEqual(['Almuerzo', 'oficina']);
      const read = await request(server)
        .get(`${TRANSACTIONS}/${created.id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);
      expect((read.body as TransactionBody).tags).toEqual(['Almuerzo', 'oficina']);
    });

    it('reuses an existing tag by its key, keeping its first spelling', async () => {
      await register({ tags: ['Almuerzo'] });

      const second = await register({ tags: ['ALMUERZÓ'] });

      expect(second.tags).toEqual(['Almuerzo']);
      await expect(tagsOf(ANA.email)).resolves.toEqual(['Almuerzo']);
    });

    // El índice único decide: cinco altas a la vez con una etiqueta nueva crean una sola.
    it('creates a new tag only once, even from requests at the same time', async () => {
      const created = await Promise.all(
        Array.from({ length: 5 }, () => register({ tags: ['viaje-cusco'] })),
      );

      expect(created.map((transaction) => transaction.tags)).toEqual(
        Array.from({ length: 5 }, () => ['viaje-cusco']),
      );
      await expect(tagsOf(ANA.email)).resolves.toEqual(['viaje-cusco']);
    });

    it.each([
      ['a blank tag', [' '], 'TAG_NAME_INVALID'],
      ['a tag with |', ['a|b'], 'TAG_NAME_INVALID'],
      [
        'more than ten',
        Array.from({ length: 11 }, (_, index) => `t${String(index)}`),
        'TOO_MANY_TAGS',
      ],
    ])('rejects %s with 422 and saves nothing', async (_case, tags, code) => {
      const response = await post({
        date: '2026-09-01',
        type: 'VARIABLE_EXPENSE',
        categoryId: anaFood,
        amount: '10.00',
        currency: 'PEN',
        description: 'Menú',
        tags,
      }).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(prisma.transaction.count()).resolves.toBe(0);
      await expect(prisma.tag.count()).resolves.toBe(0);
    });
  });

  describe('correcting the tags', () => {
    it('replaces them, and takes them all out with an empty list', async () => {
      const { id } = await register({ tags: ['almuerzo', 'oficina'] });

      const replaced = await patch(id, { tags: ['cena'] }).expect(200);
      const cleared = await patch(id, { tags: [] }).expect(200);

      expect((replaced.body as TransactionBody).tags).toEqual(['cena']);
      expect((cleared.body as TransactionBody).tags).toEqual([]);
      await expect(prisma.transactionTag.count()).resolves.toBe(0);
    });

    it('keeps them when correcting something else', async () => {
      const { id } = await register({ tags: ['almuerzo'] });

      const response = await patch(id, { amount: '12.00' }).expect(200);

      expect((response.body as TransactionBody).tags).toEqual(['almuerzo']);
    });

    it('leaves them as they were when the correction is rejected', async () => {
      const { id } = await register({ tags: ['almuerzo'] });

      await patch(id, { amount: '0', tags: ['cena'] }).expect(422);

      const read = await request(server)
        .get(`${TRANSACTIONS}/${id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);
      expect((read.body as TransactionBody).tags).toEqual(['almuerzo']);
    });
  });

  describe('filtering by a tag', () => {
    it('ignores case and accents, and adds up only what is tagged', async () => {
      const first = await register({ amount: '10.00', tags: ['Almuerzo'] });
      const second = await register({ amount: '4.50', tags: ['almuerzo', 'oficina'] });
      await register({ amount: '30.00', tags: ['cena'] });

      const page = await listed({ tag: 'ALMUERZÓ' });

      expect(page.items.map((item) => item.id).toSorted()).toEqual(
        [first.id, second.id].toSorted(),
      );
      expect(page.totals).toMatchObject([{ currency: 'PEN', expense: '14.50' }]);
    });

    it('leaves transfers out', async () => {
      await register({ tags: ['almuerzo'] });
      const method = (body: object) =>
        request(server)
          .post(METHODS)
          .set('Authorization', `Bearer ${ana}`)
          .send(body)
          .expect(201)
          .then((response) => (response.body as { id: string }).id);
      const digital = await method({
        kind: 'ACCOUNT',
        alias: 'Digital',
        institution: 'BCP',
        currency: 'PEN',
      });
      const yape = await method({
        kind: 'ACCOUNT',
        alias: 'Yape',
        institution: 'BCP',
        currency: 'PEN',
      });
      await request(server)
        .post(TRANSFERS)
        .set('Authorization', `Bearer ${ana}`)
        .send({
          date: '2026-09-01',
          fromPaymentMethodId: digital,
          toPaymentMethodId: yape,
          amount: '50.00',
          description: 'almuerzo',
        })
        .expect(201);

      const page = await listed({ tag: 'almuerzo' });

      expect(page.items.map((item) => item.kind)).toEqual(['transaction']);
    });

    it('rejects asking only for transfers with a tag', async () => {
      const response = await request(server)
        .get(TRANSACTIONS)
        .query({ kind: 'transfer', tag: 'almuerzo' })
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);

      expect(codeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });
  });

  describe('each account has its own tags', () => {
    it('keeps a tag with the same name apart for each account', async () => {
      await register({ tags: ['almuerzo'] });
      const hers = await register({ tags: ['Almuerzo'] }, bruno);

      await expect(tagsOf(ANA.email)).resolves.toEqual(['almuerzo']);
      await expect(tagsOf(BRUNO.email)).resolves.toEqual(['Almuerzo']);
      const page = await listed({ tag: 'almuerzo' }, bruno);
      expect(page.items.map((item) => item.id)).toEqual([hers.id]);
    });

    // Red por si alguien se salta la API: la clave foránea compuesta lleva el dueño.
    it('refuses, in the table itself, a transaction with the tag of another account', async () => {
      const mine = await register({ tags: ['almuerzo'] });
      await register({ tags: ['cena'] }, bruno);
      const hers = await prisma.tag.findFirstOrThrow({ where: { user: { email: BRUNO.email } } });
      const owner = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });

      await expect(
        prisma.transactionTag.create({
          data: { transactionId: mine.id, tagId: hers.id, userId: owner.id },
        }),
      ).rejects.toThrow();
    });

    it('refuses, in the table itself, a tag name with |', async () => {
      const owner = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });

      await expect(
        prisma.tag.create({ data: { userId: owner.id, name: 'a|b', nameKey: 'a|b' } }),
      ).rejects.toThrow();
    });
  });

  describe('managing them', () => {
    it('lists the tags of the account by name, counting only live transactions', async () => {
      await register({ tags: ['oficina', 'almuerzo'] });
      const deleted = await register({ tags: ['almuerzo'] });
      await register({ tags: ['cena'] }, bruno);
      await request(server)
        .delete(`${TRANSACTIONS}/${deleted.id}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(204);

      await expect(tagList()).resolves.toEqual([
        { id: expect.any(String) as string, name: 'almuerzo', transactionCount: 1 },
        { id: expect.any(String) as string, name: 'oficina', transactionCount: 1 },
      ]);
    });

    it('renames a tag everywhere it is used', async () => {
      const { id } = await register({ tags: ['comida-rapida'] });

      const response = await renameTag(await tagId('comida-rapida'), 'Delivery').expect(200);

      expect(response.body).toMatchObject({ name: 'Delivery', transactionCount: 1 });
      await expect(tagsOfTransaction(id)).resolves.toEqual(['Delivery']);
    });

    // Decidido con el autor el 2026-09-28: el nombre de otra etiqueta las fusiona.
    it('merges into another tag with that name, without repeating it anywhere', async () => {
      const fast = await register({ tags: ['comida-rapida'] });
      const both = await register({ tags: ['comida-rapida', 'delivery', 'cena'] });
      const delivery = await register({ tags: ['delivery'] });
      const target = await tagId('delivery');

      const response = await renameTag(await tagId('comida-rapida'), 'Delivery').expect(200);

      expect(response.body).toEqual({ id: target, name: 'Delivery', transactionCount: 3 });
      await expect(tagsOfTransaction(fast.id)).resolves.toEqual(['Delivery']);
      await expect(tagsOfTransaction(both.id)).resolves.toEqual(['cena', 'Delivery']);
      await expect(tagsOfTransaction(delivery.id)).resolves.toEqual(['Delivery']);
      await expect(tagsOf(ANA.email)).resolves.toEqual(['cena', 'Delivery']);
    });

    it('rejects a name with | with 422, changing nothing', async () => {
      await register({ tags: ['almuerzo'] });

      const response = await renameTag(await tagId('almuerzo'), 'a|b').expect(422);

      expect(codeOf(response)).toBe(problemType('TAG_NAME_INVALID'));
      await expect(tagsOf(ANA.email)).resolves.toEqual(['almuerzo']);
    });

    it('deletes a tag, taking it out of every transaction, which stay as they were', async () => {
      const { id } = await register({ tags: ['almuerzo', 'oficina'] });

      await deleteTag(await tagId('almuerzo')).expect(204);

      await expect(tagsOfTransaction(id)).resolves.toEqual(['oficina']);
      await expect(prisma.transaction.count()).resolves.toBe(1);
      await expect(tagsOf(ANA.email)).resolves.toEqual(['oficina']);
    });

    describe('never touches what belongs to another account', () => {
      it('neither renaming nor deleting', async () => {
        await register({ tags: ['cena'] }, bruno);
        const hers = await tagId('cena', bruno);

        const renamed = await renameTag(hers, 'otra').expect(404);
        await deleteTag(hers).expect(404);

        expect(codeOf(renamed)).toBe(problemType('TAG_NOT_FOUND'));
        await expect(tagsOf(BRUNO.email)).resolves.toEqual(['cena']);
      });

      it('nor merging into a tag of the same name in another account', async () => {
        await register({ tags: ['almuerzo'] });
        await register({ tags: ['delivery'] }, bruno);

        await renameTag(await tagId('almuerzo'), 'delivery').expect(200);

        await expect(tagsOf(ANA.email)).resolves.toEqual(['delivery']);
        await expect(tagsOf(BRUNO.email)).resolves.toEqual(['delivery']);
        await expect(tagList(bruno)).resolves.toMatchObject([{ transactionCount: 1 }]);
      });
    });

    it.each([MISSING_ID, '42'])('answers 404 for the id %s', async (id) => {
      await renameTag(id, 'otra').expect(404);
      await deleteTag(id).expect(404);
    });
  });

  describe('access', () => {
    const one = `${TAGS}/${MISSING_ID}`;
    const routes = [
      ['GET', TAGS],
      ['PATCH', one],
      ['DELETE', one],
    ] as const;

    function send(method: string, path: string): request.Test {
      switch (method) {
        case 'GET':
          return request(server).get(path);
        case 'PATCH':
          return request(server).patch(path).send({ name: 'otra' });
        default:
          return request(server).delete(path);
      }
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
