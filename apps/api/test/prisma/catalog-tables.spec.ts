import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';
const LOOKS = { color: '#1E88E5', icon: 'utensils' };

describe('catalog tables (categories and payment methods)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(email: string) {
    return prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
  }

  describe('categories', () => {
    async function createCategory(
      userId: string,
      name: string,
      extra: { type?: 'FIXED_EXPENSE' | 'VARIABLE_EXPENSE'; parentId?: string } = {},
    ) {
      return prisma.category.create({
        data: {
          userId,
          name,
          type: extra.type ?? 'VARIABLE_EXPENSE',
          parentId: extra.parentId,
          ...LOOKS,
        },
      });
    }

    it('creates a top-level category, active and with a UUIDv7 id', async () => {
      const user = await createUser('catalog-nueva@example.com');

      const category = await createCategory(user.id, 'Comida');

      expect(category.id).toMatch(UUID_V7);
      expect(category).toMatchObject({
        userId: user.id,
        type: 'VARIABLE_EXPENSE',
        name: 'Comida',
        parentId: null,
        archivedAt: null,
      });
      expect(category.createdAt).toBeInstanceOf(Date);
      expect(category.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a subcategory under a category of the same user and type', async () => {
      const user = await createUser('catalog-sub@example.com');
      const parent = await createCategory(user.id, 'Comida');

      const child = await createCategory(user.id, 'Restaurantes', { parentId: parent.id });

      const withChildren = await prisma.category.findUniqueOrThrow({
        where: { id: parent.id },
        include: { children: true },
      });
      expect(withChildren.children.map((c) => c.id)).toEqual([child.id]);
    });

    // La clave foránea compuesta (parent_id, user_id, type): adivinar el id de otra persona
    // no alcanza para colgarse de su categoría.
    it("rejects a subcategory under another user's category", async () => {
      const owner = await createUser('catalog-duena@example.com');
      const intruder = await createUser('catalog-intrusa@example.com');
      const parent = await createCategory(owner.id, 'Comida');

      await expect(
        createCategory(intruder.id, 'Restaurantes', { parentId: parent.id }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('rejects a subcategory whose type differs from its parent', async () => {
      const user = await createUser('catalog-tipos@example.com');
      const parent = await createCategory(user.id, 'Vivienda', { type: 'FIXED_EXPENSE' });

      await expect(
        createCategory(user.id, 'Cine', { type: 'VARIABLE_EXPENSE', parentId: parent.id }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('rejects a category that is its own parent', async () => {
      const user = await createUser('catalog-circular@example.com');
      const category = await createCategory(user.id, 'Comida');

      await expect(
        prisma.category.update({ where: { id: category.id }, data: { parentId: category.id } }),
      ).rejects.toThrow(/categories_not_own_parent/);
    });

    it('rejects two sibling categories whose names differ only in case', async () => {
      const user = await createUser('catalog-mayusculas@example.com');
      const parent = await createCategory(user.id, 'Comida');
      await createCategory(user.id, 'Restaurantes', { parentId: parent.id });

      await expect(
        createCategory(user.id, 'RESTAURANTES', { parentId: parent.id }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    // Sin NULLS NOT DISTINCT, PostgreSQL trataría cada parent_id nulo como distinto.
    it('rejects two top-level categories with the same name and type', async () => {
      const user = await createUser('catalog-raiz@example.com');
      await createCategory(user.id, 'Comida');

      await expect(createCategory(user.id, 'comida')).rejects.toMatchObject({ code: 'P2002' });
    });

    it('counts archived categories: a name is reused by restoring, not by creating', async () => {
      const user = await createUser('catalog-archivada@example.com');
      const archived = await createCategory(user.id, 'Netflix');
      await prisma.category.update({
        where: { id: archived.id },
        data: { archivedAt: new Date('2026-09-01T05:00:00.000Z') },
      });

      await expect(createCategory(user.id, 'Netflix')).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows the same name in another type, under another parent or for another user', async () => {
      const user = await createUser('catalog-otros@example.com');
      const other = await createUser('catalog-otra-persona@example.com');
      await createCategory(user.id, 'Otros', { type: 'VARIABLE_EXPENSE' });
      const food = await createCategory(user.id, 'Comida');
      const leisure = await createCategory(user.id, 'Salidas');
      await createCategory(user.id, 'Delivery', { parentId: food.id });

      await expect(
        createCategory(user.id, 'Otros', { type: 'FIXED_EXPENSE' }),
      ).resolves.toBeDefined();
      await expect(
        createCategory(user.id, 'Delivery', { parentId: leisure.id }),
      ).resolves.toBeDefined();
      await expect(createCategory(other.id, 'Otros')).resolves.toBeDefined();
    });

    it('rejects a blank name', async () => {
      const user = await createUser('catalog-vacia@example.com');

      await expect(createCategory(user.id, '   ')).rejects.toThrow(/categories_name_not_blank/);
    });

    it('rejects a type outside the enum', async () => {
      const user = await createUser('catalog-enum@example.com');

      await expect(
        prisma.$executeRaw`
          INSERT INTO categories (id, user_id, type, name, color, icon, updated_at)
          VALUES (gen_random_uuid(), ${user.id}::uuid, 'GIFT', 'Regalos', '#1E88E5', 'gift', now())
        `,
      ).rejects.toThrow(/transaction_type/);
    });

    // Borrar una categoría con hijas obliga a decidir antes qué pasa con ellas.
    it('does not delete a category that still has subcategories', async () => {
      const user = await createUser('catalog-con-hijas@example.com');
      const parent = await createCategory(user.id, 'Comida');
      await createCategory(user.id, 'Restaurantes', { parentId: parent.id });

      await expect(prisma.category.delete({ where: { id: parent.id } })).rejects.toThrow(
        /categories_parent_id_user_id_type_fkey/,
      );
      await expect(
        prisma.category.findUnique({ where: { id: parent.id } }),
      ).resolves.not.toBeNull();
    });

    it('deletes the whole hierarchy when the user is deleted (onDelete: Cascade)', async () => {
      const user = await createUser('catalog-cascada@example.com');
      const parent = await createCategory(user.id, 'Comida');
      await createCategory(user.id, 'Restaurantes', { parentId: parent.id });

      await prisma.user.delete({ where: { id: user.id } });

      await expect(prisma.category.count({ where: { userId: user.id } })).resolves.toBe(0);
    });
  });

  describe('payment_methods', () => {
    it('creates a credit card with only an alias, a bank and the last 4 digits', async () => {
      const user = await createUser('pagos-tarjeta@example.com');

      const card = await prisma.paymentMethod.create({
        data: {
          userId: user.id,
          kind: 'CREDIT_CARD',
          alias: 'Visa BCP',
          institution: 'BCP',
          last4: '4242',
          currency: 'PEN',
        },
      });

      expect(card.id).toMatch(UUID_V7);
      expect(card).toMatchObject({
        kind: 'CREDIT_CARD',
        alias: 'Visa BCP',
        institution: 'BCP',
        last4: '4242',
        currency: 'PEN',
        archivedAt: null,
      });
    });

    // Una tarjeta bimoneda consume en S/ y en US$: sin moneda propia.
    it('accepts a method without currency (a dual-currency card)', async () => {
      const user = await createUser('pagos-bimoneda@example.com');

      const card = await prisma.paymentMethod.create({
        data: { userId: user.id, kind: 'CREDIT_CARD', alias: 'Visa Interbank', last4: '0931' },
      });

      expect(card).toMatchObject({ currency: null, institution: null });
    });

    // Las reglas por tipo (migración catalog_payment_method_rules): la red por si alguien se
    // salta el dominio.
    it.each([
      [
        'a credit card without its last 4 digits',
        { kind: 'CREDIT_CARD', alias: 'Visa', currency: 'PEN' },
        'payment_methods_last4_by_kind',
      ],
      [
        'a wallet with last 4 digits',
        { kind: 'WALLET', alias: 'Yape', last4: '4242', currency: 'PEN' },
        'payment_methods_last4_by_kind',
      ],
      [
        'cash with last 4 digits',
        { kind: 'CASH', alias: 'Efectivo', last4: '4242' },
        'payment_methods_last4_by_kind',
      ],
      [
        'an account without currency',
        { kind: 'ACCOUNT', alias: 'Sueldo' },
        'payment_methods_currency_by_kind',
      ],
      [
        'a wallet without currency',
        { kind: 'WALLET', alias: 'Plin' },
        'payment_methods_currency_by_kind',
      ],
      [
        'cash with a bank',
        { kind: 'CASH', alias: 'Efectivo', institution: 'BCP' },
        'payment_methods_institution_by_kind',
      ],
    ] as const)('rejects %s', async (_case, data, constraint) => {
      const user = await createUser(`pagos-${constraint}-${data.alias}@example.com`);

      await expect(
        prisma.paymentMethod.create({ data: { userId: user.id, ...data } }),
      ).rejects.toThrow(new RegExp(constraint));
    });

    it('accepts an account with or without its last 4 digits', async () => {
      const user = await createUser('pagos-cuentas@example.com');

      await expect(
        prisma.paymentMethod.create({
          data: {
            userId: user.id,
            kind: 'ACCOUNT',
            alias: 'Sueldo',
            currency: 'PEN',
            last4: '0931',
          },
        }),
      ).resolves.toBeDefined();
      await expect(
        prisma.paymentMethod.create({
          data: { userId: user.id, kind: 'ACCOUNT', alias: 'Ahorros', currency: 'USD' },
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a second method with the same alias, ignoring case, archived or not', async () => {
      const user = await createUser('pagos-alias@example.com');
      const other = await createUser('pagos-alias-otra@example.com');
      await prisma.paymentMethod.create({
        data: {
          userId: user.id,
          kind: 'WALLET',
          alias: 'Yape',
          currency: 'PEN',
          archivedAt: new Date('2026-09-01T05:00:00.000Z'),
        },
      });

      await expect(
        prisma.paymentMethod.create({
          data: { userId: user.id, kind: 'WALLET', alias: 'YAPE', currency: 'PEN' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.paymentMethod.create({
          data: { userId: other.id, kind: 'WALLET', alias: 'Yape', currency: 'PEN' },
        }),
      ).resolves.toBeDefined();
    });

    // Ni menos, ni letras, ni más: más de cuatro dígitos ya sería parte del número de tarjeta.
    it.each(['424', '42a4', '12345', '12345678'])(
      'rejects %j as the last 4 digits',
      async (last4) => {
        const user = await createUser(`pagos-last4-${last4}@example.com`);

        await expect(
          prisma.paymentMethod.create({
            data: { userId: user.id, kind: 'CREDIT_CARD', alias: 'Tarjeta', last4 },
          }),
        ).rejects.toThrow(/payment_methods_last4_format/);
      },
    );

    it('rejects a blank alias', async () => {
      const user = await createUser('pagos-sin-alias@example.com');

      await expect(
        prisma.paymentMethod.create({ data: { userId: user.id, kind: 'CASH', alias: '' } }),
      ).rejects.toThrow(/payment_methods_alias_not_blank/);
    });

    it('deletes the methods when the user is deleted (onDelete: Cascade)', async () => {
      const user = await createUser('pagos-cascada@example.com');
      await prisma.paymentMethod.create({
        data: { userId: user.id, kind: 'WALLET', alias: 'Yape', currency: 'PEN' },
      });

      await prisma.user.delete({ where: { id: user.id } });

      await expect(prisma.paymentMethod.count({ where: { userId: user.id } })).resolves.toBe(0);
    });
  });
});
