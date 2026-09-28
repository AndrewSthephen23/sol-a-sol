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
const TRANSACTIONS = `/${API_PREFIX}/transactions`;
const MISSING_ID = '01999999-9999-7999-8999-999999999999';
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface CategoryBody {
  id: string;
  name: string;
  parentId: string | null;
  archivedAt: string | null;
}

/**
 * Fusionar categorías de punta a punta (ADR-0005): `catalog` fusiona y anuncia, `transactions`
 * escucha y mueve sus filas. Por eso esta prueba enciende los dos módulos.
 */
describe('merging categories', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;

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

  async function category(body: object, session = ana): Promise<CategoryBody> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return response.body as CategoryBody;
  }

  function top(name: string, type = 'VARIABLE_EXPENSE', session = ana): Promise<CategoryBody> {
    return category({ name, type }, session);
  }

  function child(name: string, parentId: string): Promise<CategoryBody> {
    return category({ name, parentId });
  }

  async function spend(categoryId: string, amount = '10.00'): Promise<string> {
    const response = await request(server)
      .post(TRANSACTIONS)
      .set('Authorization', `Bearer ${ana}`)
      .send({
        date: '2026-09-01',
        type: 'VARIABLE_EXPENSE',
        categoryId,
        amount,
        currency: 'PEN',
        description: 'Gasto',
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function merge(id: string, intoCategoryId: string, session = ana): request.Test {
    return request(server)
      .post(`${CATEGORIES}/${id}/merge`)
      .set('Authorization', `Bearer ${session}`)
      .send({ intoCategoryId });
  }

  async function categoryOf(transactionId: string): Promise<string> {
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });

    return row.categoryId;
  }

  async function stored(id: string) {
    return prisma.category.findUniqueOrThrow({ where: { id } });
  }

  function codeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  it('previews how many transactions will move with the count of the list', async () => {
    const food = await top('Víveres');
    const soda = await child('Gaseosa', food.id);
    await spend(soda.id);
    await spend(soda.id);

    const response = await request(server)
      .get(TRANSACTIONS)
      .query({ categoryId: soda.id, limit: '1' })
      .set('Authorization', `Bearer ${ana}`)
      .expect(200);

    expect((response.body as { totals: { count: number }[] }).totals).toMatchObject([{ count: 2 }]);
  });

  it('moves the transactions to the destination and archives the origin', async () => {
    const food = await top('Víveres');
    const soda = await child('Gaseosa', food.id);
    const drinks = await child('Bebidas', food.id);
    const live = await spend(soda.id);
    const deleted = await spend(soda.id);
    await request(server)
      .delete(`${TRANSACTIONS}/${deleted}`)
      .set('Authorization', `Bearer ${ana}`)
      .expect(204);

    const response = await merge(soda.id, drinks.id).expect(200);

    expect(response.body).toMatchObject({ id: drinks.id, archivedAt: null });
    await expect(categoryOf(live)).resolves.toBe(drinks.id);
    // También las borradas: restaurar una no la devuelve a la categoría fusionada.
    await expect(categoryOf(deleted)).resolves.toBe(drinks.id);
    await expect(stored(soda.id)).resolves.toMatchObject({ archivedAt: expect.any(Date) as Date });
  });

  it('moves the children along and merges a child with a sibling of the same name', async () => {
    const shopping = await top('Compras');
    const clothes = await top('Vestimenta');
    const poncho = await child('Poncho', shopping.id);
    const oldShirts = await child('Camisas', shopping.id);
    const shirts = await child('camisas', clothes.id);
    const onShopping = await spend(shopping.id);
    const onPoncho = await spend(poncho.id);
    const onOldShirts = await spend(oldShirts.id);

    await merge(shopping.id, clothes.id).expect(200);

    await expect(categoryOf(onShopping)).resolves.toBe(clothes.id);
    // La hija se mudó con sus transacciones: siguen en ella.
    await expect(categoryOf(onPoncho)).resolves.toBe(poncho.id);
    await expect(stored(poncho.id)).resolves.toMatchObject({
      parentId: clothes.id,
      archivedAt: null,
    });
    await expect(categoryOf(onOldShirts)).resolves.toBe(shirts.id);
    await expect(stored(oldShirts.id)).resolves.toMatchObject({
      archivedAt: expect.any(Date) as Date,
    });
  });

  // Si el oyente no alcanzó a mover algo, volver a fusionar lo recupera.
  it('merges an archived origin again, moving what was left', async () => {
    const food = await top('Víveres');
    const soda = await child('Gaseosa', food.id);
    await merge(soda.id, food.id).expect(200);
    const account = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
    const leftover = await prisma.transaction.create({
      data: {
        userId: account.id,
        date: new Date('2026-09-01T00:00:00.000Z'),
        type: 'VARIABLE_EXPENSE',
        categoryId: soda.id,
        amount: '5.00',
        currency: 'PEN',
        description: 'Quedó sin mover',
        source: 'MANUAL',
      },
    });

    await merge(soda.id, food.id).expect(200);

    await expect(categoryOf(leftover.id)).resolves.toBe(food.id);
  });

  describe('is rejected with 422, changing nothing', () => {
    it.each([
      ['into itself', 'itself', 'CATEGORY_MERGE_SAME'],
      ['into another type', 'other-type', 'CATEGORY_MERGE_TYPE_MISMATCH'],
      ['into its own child', 'own-child', 'CATEGORY_MERGE_INTO_OWN_CHILD'],
    ])('%s', async (_case, kind, code) => {
      const food = await top('Víveres');
      const soda = await child('Gaseosa', food.id);
      const rent = await top('Alquiler', 'FIXED_EXPENSE');
      const spent = await spend(food.id);
      const into = { itself: food.id, 'other-type': rent.id, 'own-child': soda.id }[kind] ?? '';

      const response = await merge(food.id, into).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(categoryOf(spent)).resolves.toBe(food.id);
      await expect(stored(food.id)).resolves.toMatchObject({ archivedAt: null });
    });
  });

  describe('never touches another account', () => {
    it.each(['origin', 'destination'])('answers 404 for an %s of another account', async (side) => {
      const mine = await top('Víveres');
      const hers = await top('Víveres', 'VARIABLE_EXPENSE', bruno);
      const spent = await spend(mine.id);
      const [from, into] = side === 'origin' ? [hers.id, mine.id] : [mine.id, hers.id];

      const response = await merge(from, into).expect(404);

      expect(codeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      await expect(categoryOf(spent)).resolves.toBe(mine.id);
      await expect(stored(hers.id)).resolves.toMatchObject({ archivedAt: null });
    });

    it.each([MISSING_ID, '42'])('answers 404 for the id %s', async (id) => {
      const food = await top('Víveres');

      await merge(id, food.id).expect(404);
    });
  });

  describe('converting a subcategory into a tag', () => {
    function toTag(id: string, session = ana): request.Test {
      return request(server)
        .post(`${CATEGORIES}/${id}/convert-to-tag`)
        .set('Authorization', `Bearer ${session}`);
    }

    async function tagsOf(transactionId: string): Promise<string[]> {
      const response = await request(server)
        .get(`${TRANSACTIONS}/${transactionId}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);

      return (response.body as { tags: string[] }).tags;
    }

    // "Comida > Desayuno" → "Comida" con la etiqueta "Desayuno" (decidido el 2026-09-28).
    it('moves its transactions to the parent with the tag, and archives it', async () => {
      const food = await top('Víveres');
      const breakfast = await child('Desayuno', food.id);
      const first = await spend(breakfast.id);
      const second = await spend(breakfast.id);

      const response = await toTag(breakfast.id).expect(200);

      expect(response.body).toMatchObject({ id: food.id });
      await expect(categoryOf(first)).resolves.toBe(food.id);
      await expect(tagsOf(first)).resolves.toEqual(['Desayuno']);
      await expect(tagsOf(second)).resolves.toEqual(['Desayuno']);
      await expect(stored(breakfast.id)).resolves.toMatchObject({
        archivedAt: expect.any(Date) as Date,
      });
    });

    it('reuses a tag that already exists, and filters by it with its totals', async () => {
      const food = await top('Víveres');
      const breakfast = await child('Desayuno', food.id);
      await spend(breakfast.id, '3.00');
      await request(server)
        .post(TRANSACTIONS)
        .set('Authorization', `Bearer ${ana}`)
        .send({
          date: '2026-09-02',
          type: 'VARIABLE_EXPENSE',
          categoryId: food.id,
          amount: '4.50',
          currency: 'PEN',
          description: 'Pan',
          tags: ['desayuno'],
        })
        .expect(201);

      await toTag(breakfast.id).expect(200);

      const response = await request(server)
        .get(TRANSACTIONS)
        .query({ tag: 'DESAYUNO' })
        .set('Authorization', `Bearer ${ana}`)
        .expect(200);
      expect((response.body as { totals: object[] }).totals).toMatchObject([
        { expense: '7.50', count: 2 },
      ]);
      const tags = await prisma.tag.findMany({ where: { user: { email: ANA.email } } });
      expect(tags.map((tag) => tag.name)).toEqual(['desayuno']);
    });

    it.each([
      ['a top-level category', 'top', 'ONLY_SUBCATEGORIES_CONVERT'],
      ['a name with |', 'pipe', 'TAG_NAME_INVALID'],
    ])('rejects %s with 422, changing nothing', async (_case, kind, code) => {
      const food = await top('Víveres');
      const odd = await child('Pan|Leche', food.id);
      const id = kind === 'top' ? food.id : odd.id;
      const spent = await spend(id);

      const response = await toTag(id).expect(422);

      expect(codeOf(response)).toBe(problemType(code));
      await expect(categoryOf(spent)).resolves.toBe(id);
      await expect(stored(id)).resolves.toMatchObject({ archivedAt: null });
    });

    it('answers 404 for a subcategory of another account', async () => {
      const hers = await top('Víveres', 'VARIABLE_EXPENSE', bruno);
      const breakfast = await category({ name: 'Desayuno', parentId: hers.id }, bruno);

      const response = await toTag(breakfast.id).expect(404);

      expect(codeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      await expect(stored(breakfast.id)).resolves.toMatchObject({ archivedAt: null });
    });
  });

  describe('access', () => {
    const path = `${CATEGORIES}/${MISSING_ID}/merge`;
    const toTagPath = `${CATEGORIES}/${MISSING_ID}/convert-to-tag`;
    const body = { intoCategoryId: MISSING_ID };

    it('requires a session', async () => {
      await request(server).post(path).send(body).expect(401);
      await request(server).post(toTagPath).expect(401);
    });

    it('refuses a personal access token', async () => {
      const created = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'iPhone', scopes: ['captures:write'] })
        .expect(201);
      const { token } = created.body as { token: string };

      await request(server)
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);
    });

    // 404 y no 403: un 403 confirmaría que el módulo existe.
    it('answers 404 while the catalog is off', async () => {
      process.env.FEATURE_CATALOG = 'false';

      await request(server).post(path).set('Authorization', `Bearer ${ana}`).send(body).expect(404);
      await request(server).post(toTagPath).set('Authorization', `Bearer ${ana}`).expect(404);
    });
  });
});
