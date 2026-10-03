import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';

describe('savings_goals and goal_contributions tables', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Una cuenta con una meta en soles y una transacción de ahorro. */
  async function createOwner(email: string) {
    const user = await prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
    const goal = await createGoal(user.id);
    const category = await prisma.category.create({
      data: {
        userId: user.id,
        type: 'SAVING',
        name: 'Colchón',
        color: '#43A047',
        icon: 'piggy-bank',
      },
    });
    const saving = await prisma.transaction.create({
      data: {
        userId: user.id,
        date: new Date('2026-09-10T00:00:00.000Z'),
        type: 'SAVING',
        categoryId: category.id,
        amount: '500.00',
        currency: 'PEN',
        description: 'Ahorro de setiembre',
        source: 'MANUAL',
      },
    });

    return { user, goal, saving };
  }

  function createGoal(userId: string, extra: Record<string, unknown> = {}) {
    return prisma.savingsGoal.create({
      data: {
        userId,
        name: 'Viaje a Cusco',
        targetAmount: '3000.00',
        currency: 'PEN',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        ...extra,
      },
    });
  }

  function manual(
    owner: { user: { id: string }; goal: { id: string } },
    extra: Record<string, unknown> = {},
  ) {
    return prisma.goalContribution.create({
      data: {
        userId: owner.user.id,
        goalId: owner.goal.id,
        date: new Date('2026-09-15T00:00:00.000Z'),
        amount: '250.00',
        ...extra,
      },
    });
  }

  function linked(
    owner: { user: { id: string }; goal: { id: string }; saving: { id: string } },
    extra: Record<string, unknown> = {},
  ) {
    return prisma.goalContribution.create({
      data: {
        userId: owner.user.id,
        goalId: owner.goal.id,
        transactionId: owner.saving.id,
        ...extra,
      },
    });
  }

  describe('savings_goals', () => {
    it('stores a goal with its target as an exact decimal', async () => {
      const user = await prisma.user.create({
        data: { email: 'meta-nueva@example.com', passwordHash: FAKE_HASH },
      });

      const created = await createGoal(user.id, { targetAmount: '1234567890123456.78' });

      expect(created.id).toMatch(UUID_V7);
      expect(created.archivedAt).toBeNull();
      const [row] = await prisma.$queryRaw<{ target: string }[]>`
        SELECT target_amount::text AS target FROM savings_goals WHERE id = ${created.id}::uuid
      `;
      expect(row?.target).toBe('1234567890123456.78');
    });

    it('keeps names unique per account ignoring case, archived goals included', async () => {
      const owner = await createOwner('meta-nombre-unico@example.com');
      await prisma.savingsGoal.update({
        where: { id: owner.goal.id },
        data: { archivedAt: new Date() },
      });

      await expect(createGoal(owner.user.id, { name: 'VIAJE A CUSCO' })).rejects.toThrow(
        /savings_goals_unique_name|user_id/u,
      );
    });

    it('lets another account use the same name', async () => {
      await createOwner('meta-nombre-ana@example.com');

      await expect(createOwner('meta-nombre-bruno@example.com')).resolves.toMatchObject({});
    });

    it('refuses a blank name', async () => {
      const user = await prisma.user.create({
        data: { email: 'meta-sin-nombre@example.com', passwordHash: FAKE_HASH },
      });

      await expect(createGoal(user.id, { name: '   ' })).rejects.toThrow(
        /savings_goals_name_not_blank/u,
      );
    });

    it.each(['0.00', '-0.01'])('refuses a target of %s', async (targetAmount) => {
      const user = await prisma.user.create({
        data: { email: `meta-objetivo-${targetAmount}@example.com`, passwordHash: FAKE_HASH },
      });

      await expect(createGoal(user.id, { targetAmount })).rejects.toThrow(
        /savings_goals_target_amount_positive/u,
      );
    });

    it('accepts a goal several years long', async () => {
      const user = await prisma.user.create({
        data: { email: 'meta-tres-anios@example.com', passwordHash: FAKE_HASH },
      });

      await expect(
        createGoal(user.id, { endDate: new Date('2029-01-01T00:00:00.000Z') }),
      ).resolves.toMatchObject({});
    });

    it.each([
      ['the same day as its start', '2026-01-01'],
      ['before its start', '2025-12-31'],
    ])('refuses an end %s', async (_label, endDate) => {
      const user = await prisma.user.create({
        data: { email: `meta-fin-${endDate}@example.com`, passwordHash: FAKE_HASH },
      });

      await expect(
        createGoal(user.id, { endDate: new Date(`${endDate}T00:00:00.000Z`) }),
      ).rejects.toThrow(/savings_goals_end_after_start/u);
    });
  });

  describe('goal_contributions', () => {
    it('stores a manual contribution and a withdrawal as exact decimals', async () => {
      const owner = await createOwner('aporte-manual@example.com');

      const contribution = await manual(owner);
      const withdrawal = await manual(owner, { kind: 'WITHDRAWAL', amount: '0.01' });

      expect(contribution.id).toMatch(UUID_V7);
      expect(contribution.kind).toBe('CONTRIBUTION');
      expect(contribution.amount?.toFixed(2)).toBe('250.00');
      expect(withdrawal.kind).toBe('WITHDRAWAL');
      expect(withdrawal.amount?.toFixed(2)).toBe('0.01');
    });

    it('stores a linked contribution without a date or an amount of its own', async () => {
      const owner = await createOwner('aporte-enlazado@example.com');

      await expect(linked(owner)).resolves.toMatchObject({
        kind: 'CONTRIBUTION',
        date: null,
        amount: null,
      });
    });

    it.each([
      ['a manual one without its date', 'manual', { date: null }],
      ['a manual one without its amount', 'manual', { amount: null }],
      ['a linked one with a date', 'linked', { date: new Date('2026-09-15T00:00:00.000Z') }],
      ['a linked one with an amount', 'linked', { amount: '500.00' }],
      ['a linked withdrawal', 'linked', { kind: 'WITHDRAWAL' }],
    ])('refuses %s', async (label, form, extra) => {
      const owner = await createOwner(`aporte-forma-${label.replaceAll(' ', '-')}@example.com`);

      const create = form === 'manual' ? manual(owner, extra) : linked(owner, extra);

      await expect(create).rejects.toThrow(/goal_contributions_manual_or_linked/u);
    });

    it.each(['0.00', '-0.01'])('refuses an amount of %s', async (amount) => {
      const owner = await createOwner(`aporte-monto-${amount}@example.com`);

      await expect(manual(owner, { amount })).rejects.toThrow(
        /goal_contributions_amount_positive/u,
      );
    });

    it('links a transaction to a single goal', async () => {
      const owner = await createOwner('aporte-una-meta@example.com');
      const other = await createGoal(owner.user.id, { name: 'Laptop' });
      await linked(owner);

      await expect(linked({ ...owner, goal: other })).rejects.toThrow(/transaction_id/u);
    });

    it('refuses the goal of another account, even skipping the application', async () => {
      const ana = await createOwner('aporte-meta-ana@example.com');
      const bruno = await createOwner('aporte-meta-bruno@example.com');

      await expect(manual({ ...ana, goal: bruno.goal })).rejects.toThrow(
        /goal_contributions_goal_id_user_id_fkey/u,
      );
    });

    it('refuses the transaction of another account, even skipping the application', async () => {
      const ana = await createOwner('aporte-transaccion-ana@example.com');
      const bruno = await createOwner('aporte-transaccion-bruno@example.com');

      await expect(linked({ ...ana, saving: bruno.saving })).rejects.toThrow(
        /goal_contributions_transaction_id_user_id_fkey/u,
      );
    });

    it('does not let a linked transaction be deleted for good', async () => {
      const owner = await createOwner('aporte-borrar-transaccion@example.com');
      await linked(owner);

      await expect(prisma.transaction.delete({ where: { id: owner.saving.id } })).rejects.toThrow(
        /goal_contributions_transaction_id_user_id_fkey/u,
      );
    });
  });

  it('deleting a goal deletes its contributions', async () => {
    const owner = await createOwner('meta-borrar@example.com');
    await manual(owner);
    await linked(owner);

    await prisma.savingsGoal.delete({ where: { id: owner.goal.id } });

    await expect(prisma.goalContribution.count({ where: { goalId: owner.goal.id } })).resolves.toBe(
      0,
    );
  });

  it('goals and contributions go away with their account', async () => {
    const owner = await createOwner('meta-borrar-cuenta@example.com');
    await manual(owner);
    await linked(owner);

    await prisma.user.delete({ where: { id: owner.user.id } });

    await expect(prisma.savingsGoal.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(prisma.goalContribution.count({ where: { userId: owner.user.id } })).resolves.toBe(
      0,
    );
  });
});
