import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { SeedAccountsWithoutCategories } from '../../src/modules/catalog/index.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const CATEGORIES = `/${API_PREFIX}/categories`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface CategoryNode {
  name: string;
  type: string;
  children: { name: string }[];
}

describe('default categories', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

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

  async function categoriesOf(credentials: typeof ANA): Promise<CategoryNode[]> {
    const login = await request(server).post(LOGIN).send(credentials).expect(200);
    const { accessToken } = login.body as { accessToken: string };
    const response = await request(server)
      .get(CATEGORIES)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return response.body as CategoryNode[];
  }

  // Llegan con el registro, por el evento de identity: sin pasos extra ni un segundo pedido.
  it('gives a new account its categories as soon as it registers', async () => {
    await request(server).post(REGISTER).send(ANA).expect(201);

    const categories = await categoriesOf(ANA);

    expect(categories).toHaveLength(22);
    expect(categories.find((node) => node.name === 'Vivienda')).toMatchObject({
      type: 'FIXED_EXPENSE',
      children: [
        { name: 'Agua' },
        { name: 'Alquiler' },
        { name: 'Comunicaciones' },
        { name: 'Internet' },
        { name: 'Luz' },
      ],
    });
    await expect(prisma.category.count()).resolves.toBe(34);
  });

  // El flag decide qué se expone, no qué datos existen: al encenderlo, ya están.
  it('seeds even while the catalog is off', async () => {
    process.env.FEATURE_CATALOG = 'false';

    await request(server).post(REGISTER).send(ANA).expect(201);

    await expect(prisma.category.count()).resolves.toBe(34);
  });

  it('keeps the categories of each account apart', async () => {
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server)
      .post(REGISTER)
      .send({ email: 'bruno@example.com', password: 'otra frase bastante larga' })
      .expect(201);

    const owners = await prisma.category.groupBy({ by: ['userId'], _count: true });

    expect(owners.map((owner) => owner._count)).toEqual([34, 34]);
  });

  describe('pnpm db:seed', () => {
    // Una cuenta creada antes de la semilla (aquí, directo en la base, sin evento).
    async function accountWithoutEvent(email: string): Promise<string> {
      const user = await prisma.user.create({ data: { email, passwordHash: 'fake' } });

      return user.id;
    }

    it('seeds the accounts without categories and leaves the others alone', async () => {
      const empty = await accountWithoutEvent('vacia@example.com');
      const own = await accountWithoutEvent('propias@example.com');
      await prisma.category.create({
        data: {
          userId: own,
          type: 'INCOME',
          name: 'Honorarios',
          color: '#2E7D32',
          icon: 'briefcase',
        },
      });

      const summary = await app.get(SeedAccountsWithoutCategories).execute();

      expect(summary).toEqual({ seeded: 1, skipped: 1 });
      await expect(prisma.category.count({ where: { userId: empty } })).resolves.toBe(34);
      await expect(prisma.category.findMany({ where: { userId: own } })).resolves.toMatchObject([
        { name: 'Honorarios' },
      ]);
    });

    // Idempotente: correrla dos veces no duplica nada.
    it('does nothing the second time', async () => {
      await accountWithoutEvent('vacia@example.com');
      const seed = app.get(SeedAccountsWithoutCategories);
      await seed.execute();

      await expect(seed.execute()).resolves.toEqual({ seeded: 0, skipped: 1 });
      await expect(prisma.category.count()).resolves.toBe(34);
    });

    // Dos semillas a la vez sobre la misma cuenta: el índice único frena los duplicados.
    it('does not duplicate anything when two seeds run at once', async () => {
      await accountWithoutEvent('vacia@example.com');
      const seed = app.get(SeedAccountsWithoutCategories);

      const results = await Promise.all([seed.execute(), seed.execute()]);

      expect(results.map((result) => result.seeded).toSorted()).toEqual([0, 1]);
      await expect(prisma.category.count()).resolves.toBe(34);
    });
  });
});
