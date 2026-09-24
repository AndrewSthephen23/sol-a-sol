import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';
const LOOKS = { color: '#1E88E5', icon: 'utensils' };
/** Una fecha de negocio: Prisma la manda como medianoche UTC y la base guarda solo el día. */
const SEPT_15 = new Date('2026-09-15T00:00:00.000Z');

describe('transactions table', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Un usuario con una categoría de gasto variable y una tarjeta. */
  async function createOwner(email: string) {
    const user = await prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
    const food = await prisma.category.create({
      data: { userId: user.id, type: 'VARIABLE_EXPENSE', name: 'Comida', ...LOOKS },
    });
    const card = await prisma.paymentMethod.create({
      data: { userId: user.id, kind: 'CREDIT_CARD', alias: 'Visa BCP', last4: '4242' },
    });

    return { user, food, card };
  }

  function lunch(userId: string, categoryId: string, extra: Record<string, unknown> = {}) {
    return prisma.transaction.create({
      data: {
        userId,
        categoryId,
        type: 'VARIABLE_EXPENSE',
        date: SEPT_15,
        amount: '25.90',
        currency: 'PEN',
        description: 'Almuerzo',
        source: 'MANUAL',
        ...extra,
      },
    });
  }

  it('stores the date without time and the amount as an exact decimal', async () => {
    const { user, food, card } = await createOwner('tx-nueva@example.com');

    const created = await lunch(user.id, food.id, {
      amount: '1234.50',
      paymentMethodId: card.id,
      merchant: 'TAMBO',
    });

    expect(created.id).toMatch(UUID_V7);
    expect(created).toMatchObject({
      paymentMethodId: card.id,
      merchant: 'TAMBO',
      captureId: null,
      deletedAt: null,
    });
    const [row] = await prisma.$queryRaw<{ date: string; amount: string }[]>`
      SELECT date::text AS date, amount::text AS amount FROM transactions WHERE id = ${created.id}::uuid
    `;
    expect(row).toEqual({ date: '2026-09-15', amount: '1234.50' });
  });

  it('describes date as DATE and amount as NUMERIC(18,2)', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string; type: string }[]>`
      SELECT column_name, format_type(atttypid, atttypmod) AS type
      FROM information_schema.columns
      JOIN pg_attribute ON attrelid = 'transactions'::regclass AND attname = column_name
      WHERE table_name = 'transactions' AND column_name IN ('date', 'amount')
      ORDER BY column_name
    `;

    expect(columns).toEqual([
      { column_name: 'amount', type: 'numeric(18,2)' },
      { column_name: 'date', type: 'date' },
    ]);
  });

  it('indexes the transactions of a user by date, the way they are always listed', async () => {
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'transactions_user_id_date_idx'
    `;

    expect(index?.indexdef).toContain('(user_id, date)');
  });

  // El signo lo da el tipo: la base rechaza lo que el dominio ya rechaza, por si alguien lo salta.
  it.each(['0', '-25.90'])('rejects an amount of %s', async (amount) => {
    const { user, food } = await createOwner(`tx-monto-${amount}@example.com`);

    await expect(lunch(user.id, food.id, { amount })).rejects.toThrow(
      /transactions_amount_positive/,
    );
  });

  describe('category', () => {
    it("rejects another user's category", async () => {
      const ana = await createOwner('tx-cat-ana@example.com');
      const bruno = await createOwner('tx-cat-bruno@example.com');

      await expect(lunch(bruno.user.id, ana.food.id)).rejects.toMatchObject({ code: 'P2003' });
    });

    // La clave foránea compuesta (category_id, user_id, type): un ingreso no cabe en "Comida".
    it('rejects a category of another type', async () => {
      const { user, food } = await createOwner('tx-cat-tipo@example.com');

      await expect(lunch(user.id, food.id, { type: 'INCOME' })).rejects.toMatchObject({
        code: 'P2003',
      });
    });

    it('does not delete a category that has transactions: it is archived instead', async () => {
      const { user, food } = await createOwner('tx-cat-borrar@example.com');
      await lunch(user.id, food.id);

      await expect(prisma.category.delete({ where: { id: food.id } })).rejects.toThrow(
        /transactions_category_id_user_id_type_fkey/,
      );
    });
  });

  describe('payment method', () => {
    it('is optional', async () => {
      const { user, food } = await createOwner('tx-sin-metodo@example.com');

      await expect(lunch(user.id, food.id)).resolves.toMatchObject({ paymentMethodId: null });
    });

    it("rejects another user's payment method", async () => {
      const ana = await createOwner('tx-pm-ana@example.com');
      const bruno = await createOwner('tx-pm-bruno@example.com');

      await expect(
        lunch(bruno.user.id, bruno.food.id, { paymentMethodId: ana.card.id }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('does not delete a payment method that has transactions', async () => {
      const { user, food, card } = await createOwner('tx-pm-borrar@example.com');
      await lunch(user.id, food.id, { paymentMethodId: card.id });

      await expect(prisma.paymentMethod.delete({ where: { id: card.id } })).rejects.toThrow(
        /transactions_payment_method_id_user_id_fkey/,
      );
    });
  });

  // Sin clave foránea hasta H7, cuando llegue la tabla de capturas.
  it('accepts a capture id without a captures table yet', async () => {
    const { user, food } = await createOwner('tx-captura@example.com');
    const captureId = '01999999-9999-7999-8999-999999999999';

    await expect(
      lunch(user.id, food.id, { captureId, source: 'IOS_SHORTCUT' }),
    ).resolves.toMatchObject({ captureId, source: 'IOS_SHORTCUT' });
  });

  it('rejects a source outside the enum', async () => {
    const { user, food } = await createOwner('tx-origen@example.com');

    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (id, user_id, date, type, category_id, amount, currency, description, source, updated_at)
        VALUES (gen_random_uuid(), ${user.id}::uuid, '2026-09-15', 'VARIABLE_EXPENSE', ${food.id}::uuid, 10, 'PEN', 'x', 'EMAIL', now())
      `,
    ).rejects.toThrow(/transaction_source/);
  });

  // El borrado es lógico: la fila se queda para la auditoría y para poder deshacerlo.
  it('keeps a deleted transaction, marked with deletedAt', async () => {
    const { user, food } = await createOwner('tx-borrada@example.com');
    const created = await lunch(user.id, food.id);

    await prisma.transaction.update({
      where: { id: created.id },
      data: { deletedAt: new Date('2026-09-16T15:00:00.000Z') },
    });

    await expect(
      prisma.transaction.findUnique({ where: { id: created.id } }),
    ).resolves.toMatchObject({ deletedAt: new Date('2026-09-16T15:00:00.000Z') });
  });

  it('deletes the transactions, categories and methods when the user is deleted', async () => {
    const { user, food, card } = await createOwner('tx-cascada@example.com');
    await lunch(user.id, food.id, { paymentMethodId: card.id });

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.transaction.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.category.count({ where: { userId: user.id } })).resolves.toBe(0);
  });
});
