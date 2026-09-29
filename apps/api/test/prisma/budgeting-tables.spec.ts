import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';
const LOOKS = { color: '#1E88E5', icon: 'utensils' };

describe('budgeting tables', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Una cuenta con una categoría de gasto variable y el presupuesto de setiembre. */
  async function createOwner(email: string) {
    const user = await prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
    const food = await prisma.category.create({
      data: { userId: user.id, type: 'VARIABLE_EXPENSE', name: 'Víveres', ...LOOKS },
    });
    const budget = await prisma.budget.create({ data: { userId: user.id, year: 2026, month: 9 } });

    return { user, food, budget };
  }

  function line(
    owner: { user: { id: string }; budget: { id: string }; food: { id: string } },
    extra: Record<string, unknown> = {},
  ) {
    return prisma.budgetLine.create({
      data: {
        budgetId: owner.budget.id,
        userId: owner.user.id,
        categoryId: owner.food.id,
        type: 'VARIABLE_EXPENSE',
        plannedAmount: '800.00',
        currency: 'PEN',
        ...extra,
      },
    });
  }

  it('stores a line with its planned amount as an exact decimal', async () => {
    const owner = await createOwner('budget-nuevo@example.com');

    const created = await line(owner, { plannedAmount: '1234567890123456.78' });

    expect(created.id).toMatch(UUID_V7);
    const [row] = await prisma.$queryRaw<{ planned: string }[]>`
      SELECT planned_amount::text AS planned FROM budget_lines WHERE id = ${created.id}::uuid
    `;
    expect(row?.planned).toBe('1234567890123456.78');
  });

  it('keeps a single budget per month and account', async () => {
    const { user } = await createOwner('budget-unico@example.com');

    await expect(
      prisma.budget.create({ data: { userId: user.id, year: 2026, month: 9 } }),
    ).rejects.toThrow();
    await expect(
      prisma.budget.create({ data: { userId: user.id, year: 2026, month: 10 } }),
    ).resolves.toMatchObject({ month: 10 });
  });

  it.each([0, 13])('refuses month %i', async (month) => {
    const { user } = await createOwner(`budget-mes-${String(month)}@example.com`);

    await expect(
      prisma.budget.create({ data: { userId: user.id, year: 2027, month } }),
    ).rejects.toThrow(/budgets_month_range/u);
  });

  it('allows one line per category and currency, and a zero amount', async () => {
    const owner = await createOwner('budget-monedas@example.com');

    await line(owner);
    await expect(line(owner, { currency: 'USD', plannedAmount: '0.00' })).resolves.toMatchObject({
      currency: 'USD',
    });
    await expect(line(owner, { plannedAmount: '10.00' })).rejects.toThrow();
  });

  it('refuses a negative planned amount', async () => {
    const owner = await createOwner('budget-negativo@example.com');

    await expect(line(owner, { plannedAmount: '-1.00' })).rejects.toThrow(
      /budget_lines_planned_amount_not_negative/u,
    );
  });

  it('refuses a line whose type is not the type of its category', async () => {
    const owner = await createOwner('budget-tipo@example.com');

    await expect(line(owner, { type: 'INCOME' })).rejects.toThrow();
  });

  describe('never mixes accounts, even skipping the application', () => {
    it('refuses a line in the budget of another account', async () => {
      const ana = await createOwner('budget-ana@example.com');
      const bruno = await createOwner('budget-bruno@example.com');

      await expect(line({ ...ana, budget: bruno.budget })).rejects.toThrow();
    });

    it('refuses a line with the category of another account', async () => {
      const ana = await createOwner('budget-ana-2@example.com');
      const bruno = await createOwner('budget-bruno-2@example.com');

      await expect(line({ ...ana, food: bruno.food })).rejects.toThrow();
    });
  });

  it('deletes the lines with their budget, and never the category', async () => {
    const owner = await createOwner('budget-borrar@example.com');
    const created = await line(owner);

    await prisma.budget.delete({ where: { id: owner.budget.id } });

    await expect(prisma.budgetLine.findUnique({ where: { id: created.id } })).resolves.toBeNull();
    await expect(
      prisma.category.findUnique({ where: { id: owner.food.id } }),
    ).resolves.not.toBeNull();
  });

  it('goes away with its account, lines and all', async () => {
    const owner = await createOwner('budget-cuenta@example.com');
    await line(owner);

    await prisma.user.delete({ where: { id: owner.user.id } });

    await expect(prisma.budget.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(prisma.budgetLine.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
  });

  it('does not let a category with lines be deleted', async () => {
    const owner = await createOwner('budget-categoria@example.com');
    await line(owner);

    await expect(prisma.category.delete({ where: { id: owner.food.id } })).rejects.toThrow();
  });
});
