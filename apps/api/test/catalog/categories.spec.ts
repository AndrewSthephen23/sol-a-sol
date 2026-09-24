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
const MISSING_ID = '01999999-9999-7999-8999-999999999999';
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

const FOOD = { name: 'Comida', type: 'VARIABLE_EXPENSE', color: '#1E88E5', icon: 'utensils' };
const SALARY = { name: 'Sueldo o Salario', type: 'INCOME' };

interface CategoryBody {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
  archivedAt: string | null;
  children?: CategoryBody[];
}

describe('categories', () => {
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
    // Cada cuenta nace con la semilla (default-categories.spec.ts la prueba). Aquí se prueba el
    // CRUD desde una cuenta vacía, para que los nombres y los conteos sean los de cada prueba.
    await prisma.category.deleteMany();
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

  async function create(body: object, session = ana): Promise<CategoryBody> {
    const response = await request(server)
      .post(CATEGORIES)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return response.body as CategoryBody;
  }

  async function tree(session = ana, query = ''): Promise<CategoryBody[]> {
    const response = await request(server)
      .get(`${CATEGORIES}${query}`)
      .set('Authorization', `Bearer ${session}`)
      .expect(200);

    return response.body as CategoryBody[];
  }

  function patch(id: string, body: object, session = ana): request.Test {
    return request(server)
      .patch(`${CATEGORIES}/${id}`)
      .set('Authorization', `Bearer ${session}`)
      .send(body);
  }

  function typeOf(response: request.Response): string {
    return (response.body as ProblemDetails).type;
  }

  async function archivedAt(id: string): Promise<Date | null> {
    return (await prisma.category.findUniqueOrThrow({ where: { id } })).archivedAt;
  }

  describe('creating', () => {
    it('creates a top-level category', async () => {
      const food = await create(FOOD);

      expect(food).toMatchObject({ ...FOOD, parentId: null, archivedAt: null });
      expect(food).not.toHaveProperty('userId');
    });

    it('creates a subcategory that inherits type, color and icon', async () => {
      const food = await create(FOOD);

      const delivery = await create({ name: 'Delivery', parentId: food.id });

      expect(delivery).toMatchObject({
        type: 'VARIABLE_EXPENSE',
        parentId: food.id,
        color: '#1E88E5',
        icon: 'utensils',
      });
    });

    it.each([
      ['a top-level category without type', () => ({ name: 'Sin tipo' }), 'CATEGORY_TYPE_REQUIRED'],
      ['a color that is not #RRGGBB', () => ({ ...FOOD, color: 'azul' }), 'INVALID_CATEGORY_COLOR'],
      [
        'an icon that is not kebab-case',
        () => ({ ...FOOD, icon: 'Utensils' }),
        'VALIDATION_FAILED',
      ],
      ['an unknown field', () => ({ ...FOOD, archivedAt: 'x' }), 'VALIDATION_FAILED'],
    ])('refuses %s with 422', async (_case, body, code) => {
      const response = await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${ana}`)
        .send(body())
        .expect(422);

      expect(typeOf(response)).toBe(problemType(code));
      await expect(prisma.category.count()).resolves.toBe(0);
    });

    it('refuses a subcategory of a subcategory: there is a single level', async () => {
      const food = await create(FOOD);
      const delivery = await create({ name: 'Delivery', parentId: food.id });

      const response = await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'Pizza', parentId: delivery.id })
        .expect(422);

      expect(typeOf(response)).toBe(problemType('CATEGORY_TOO_DEEP'));
    });

    it('refuses a subcategory whose type differs from its parent', async () => {
      const food = await create(FOOD);

      const response = await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${ana}`)
        .send({ name: 'Alquiler', type: 'FIXED_EXPENSE', parentId: food.id })
        .expect(422);

      expect(typeOf(response)).toBe(problemType('SUBCATEGORY_TYPE_MISMATCH'));
    });

    it.each(['comida', 'COMIDA', 'Comída'])(
      'refuses %j next to "Comida" with 409: case and accents do not count',
      async (name) => {
        await create(FOOD);

        const response = await request(server)
          .post(CATEGORIES)
          .set('Authorization', `Bearer ${ana}`)
          .send({ ...FOOD, name })
          .expect(409);

        expect(typeOf(response)).toBe(problemType('CATEGORY_NAME_TAKEN'));
      },
    );

    it('keeps "Año" and "Ano" apart: the ñ is a letter, not an accent', async () => {
      await create({ ...FOOD, name: 'Año nuevo' });

      await expect(create({ ...FOOD, name: 'Ano nuevo' })).resolves.toBeDefined();
    });

    it('allows the same name in another type', async () => {
      await create({ name: 'Otros', type: 'VARIABLE_EXPENSE' });

      await expect(create({ name: 'Otros', type: 'FIXED_EXPENSE' })).resolves.toBeDefined();
    });

    it('refuses the name of an archived sibling: it is restored instead', async () => {
      const food = await create(FOOD);
      await patch(food.id, { archived: true }).expect(200);

      await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${ana}`)
        .send(FOOD)
        .expect(409);
    });
  });

  describe('listing', () => {
    it('nests the subcategories and orders by name', async () => {
      const food = await create(FOOD);
      await create({ name: 'Supermercado', parentId: food.id });
      await create({ name: 'Delivery', parentId: food.id });
      await create(SALARY);

      const categories = await tree();

      expect(categories.map((node) => node.name)).toEqual(['Comida', 'Sueldo o Salario']);
      expect(categories[0]?.children?.map((child) => child.name)).toEqual([
        'Delivery',
        'Supermercado',
      ]);
    });

    it('filters by type', async () => {
      await create(FOOD);
      await create(SALARY);

      const income = await tree(ana, '?type=INCOME');

      expect(income.map((node) => node.name)).toEqual(['Sueldo o Salario']);
    });

    it('leaves the archived ones out, unless asked', async () => {
      await create(SALARY);
      const food = await create(FOOD);
      await patch(food.id, { archived: true }).expect(200);

      expect((await tree()).map((node) => node.name)).toEqual(['Sueldo o Salario']);
      expect((await tree(ana, '?includeArchived=true')).map((node) => node.name)).toEqual([
        'Comida',
        'Sueldo o Salario',
      ]);
    });

    it.each(['?type=GIFT', '?includeArchived=1'])('refuses %s with 422', async (query) => {
      await request(server)
        .get(`${CATEGORIES}${query}`)
        .set('Authorization', `Bearer ${ana}`)
        .expect(422);
    });
  });

  describe('updating', () => {
    it('renames and changes the color and icon', async () => {
      const food = await create(FOOD);

      const response = await patch(food.id, {
        name: 'Alimentación',
        color: '#43A047',
        icon: 'apple',
      }).expect(200);

      expect(response.body).toMatchObject({
        name: 'Alimentación',
        color: '#43A047',
        icon: 'apple',
      });
    });

    it.each([
      ['the type', { type: 'INCOME' }],
      ['the parent', { parentId: MISSING_ID }],
      ['nothing', {}],
    ])('refuses a change of %s with 422', async (_case, body) => {
      const food = await create(FOOD);

      const response = await patch(food.id, body).expect(422);

      expect(typeOf(response)).toBe(problemType('VALIDATION_FAILED'));
    });

    it('archives a parent with its children, and restores only those archived with it', async () => {
      const food = await create(FOOD);
      const delivery = await create({ name: 'Delivery', parentId: food.id });
      const market = await create({ name: 'Mercado', parentId: food.id });
      await patch(market.id, { archived: true }).expect(200);
      const marketArchivedAt = await archivedAt(market.id);

      await patch(food.id, { archived: true }).expect(200);
      expect(await archivedAt(delivery.id)).toEqual(await archivedAt(food.id));

      await patch(food.id, { archived: false }).expect(200);
      expect(await archivedAt(food.id)).toBeNull();
      expect(await archivedAt(delivery.id)).toBeNull();
      expect(await archivedAt(market.id)).toEqual(marketArchivedAt);
    });

    it('does not restore a subcategory while its parent is archived', async () => {
      const food = await create(FOOD);
      const delivery = await create({ name: 'Delivery', parentId: food.id });
      await patch(food.id, { archived: true }).expect(200);

      const response = await patch(delivery.id, { archived: false }).expect(422);

      expect(typeOf(response)).toBe(problemType('PARENT_CATEGORY_ARCHIVED'));
      expect(await archivedAt(delivery.id)).not.toBeNull();
    });

    it('refuses a name taken by a sibling with 409', async () => {
      await create(SALARY);
      const deposits = await create({ name: 'Depósitos', type: 'INCOME' });

      await patch(deposits.id, { name: 'sueldo o salario' }).expect(409);
    });

    it.each([
      ['does not exist', MISSING_ID],
      ['is not even a UUID', 'no-es-un-uuid'],
    ])('answers 404 for a category that %s', async (_case, id) => {
      const response = await patch(id, { name: 'Otra' }).expect(404);

      expect(typeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
    });
  });

  // Archivar no reescribe el pasado: la transacción vieja sigue en su categoría.
  it('keeps an archived category on the transactions that already use it', async () => {
    const food = await create(FOOD);
    const anaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } })).id;
    const lunch = await prisma.transaction.create({
      data: {
        userId: anaId,
        categoryId: food.id,
        type: 'VARIABLE_EXPENSE',
        date: new Date('2026-09-15T00:00:00.000Z'),
        amount: '25.90',
        currency: 'PEN',
        description: 'Almuerzo',
        source: 'MANUAL',
      },
    });

    await patch(food.id, { archived: true }).expect(200);

    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { id: lunch.id },
        include: { category: true },
      }),
    ).resolves.toMatchObject({ categoryId: food.id, category: { name: 'Comida' } });
  });

  describe('user isolation (anti-IDOR)', () => {
    it("lists only the user's own categories", async () => {
      await create(FOOD, ana);
      await create(SALARY, bruno);

      expect((await tree(bruno)).map((node) => node.name)).toEqual(['Sueldo o Salario']);
    });

    it("answers 404 for another user's category and leaves it untouched", async () => {
      const food = await create(FOOD, ana);

      const response = await patch(food.id, { name: 'Mía', archived: true }, bruno).expect(404);

      expect(typeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      await expect(
        prisma.category.findUniqueOrThrow({ where: { id: food.id } }),
      ).resolves.toMatchObject({ name: 'Comida', archivedAt: null });
    });

    it("answers 404 when hanging a subcategory from another user's category", async () => {
      const food = await create(FOOD, ana);

      const response = await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${bruno}`)
        .send({ name: 'Delivery', parentId: food.id })
        .expect(404);

      expect(typeOf(response)).toBe(problemType('CATEGORY_NOT_FOUND'));
      await expect(prisma.category.count()).resolves.toBe(1);
    });

    // El dueño sale del token, nunca del cuerpo.
    it('refuses a userId in the body instead of creating the category for someone else', async () => {
      const anaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } })).id;

      await request(server)
        .post(CATEGORIES)
        .set('Authorization', `Bearer ${bruno}`)
        .send({ ...FOOD, userId: anaId })
        .expect(422);

      await expect(prisma.category.count()).resolves.toBe(0);
    });
  });

  describe('access', () => {
    const routes = [
      ['GET', CATEGORIES, undefined],
      ['POST', CATEGORIES, FOOD],
      ['PATCH', `${CATEGORIES}/${MISSING_ID}`, { name: 'Otra' }],
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
