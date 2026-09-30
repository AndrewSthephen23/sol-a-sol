import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';

describe('installment_plans table', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Una cuenta con su tarjeta configurada y una compra hecha con ella. */
  async function createOwner(email: string) {
    const user = await prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
    const visa = await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        kind: 'CREDIT_CARD',
        alias: 'Visa',
        institution: 'BCP',
        last4: '1234',
      },
    });
    const card = await prisma.creditCard.create({
      data: {
        userId: user.id,
        paymentMethodId: visa.id,
        creditLimit: '5000.00',
        creditLimitCurrency: 'PEN',
        statementDay: 20,
        paymentDueRule: 'DAYS_AFTER_STATEMENT',
        dueDaysAfterStatement: 25,
      },
    });
    const category = await prisma.category.create({
      data: {
        userId: user.id,
        type: 'VARIABLE_EXPENSE',
        name: 'Electrodomésticos',
        color: '#1E88E5',
        icon: 'tv',
      },
    });
    const purchase = await prisma.transaction.create({
      data: {
        userId: user.id,
        date: new Date('2026-09-10T00:00:00.000Z'),
        type: 'VARIABLE_EXPENSE',
        categoryId: category.id,
        amount: '1200.00',
        currency: 'PEN',
        description: 'Televisor',
        paymentMethodId: visa.id,
        source: 'MANUAL',
      },
    });

    return { user, card, purchase };
  }

  function plan(
    owner: { user: { id: string }; card: { id: string }; purchase: { id: string } },
    extra: Record<string, unknown> = {},
  ) {
    return prisma.installmentPlan.create({
      data: {
        userId: owner.user.id,
        creditCardId: owner.card.id,
        transactionId: owner.purchase.id,
        count: 12,
        ...extra,
      },
    });
  }

  it('stores a plan without interest, and one with the bank total as an exact decimal', async () => {
    const plain = await createOwner('cuotas-sin-interes@example.com');
    const withInterest = await createOwner('cuotas-con-interes@example.com');

    await expect(plan(plain)).resolves.toMatchObject({ totalAmount: null, count: 12 });
    const created = await plan(withInterest, { totalAmount: '1302.36' });
    expect(created.totalAmount?.toFixed(2)).toBe('1302.36');
  });

  it('keeps a single plan per purchase', async () => {
    const owner = await createOwner('cuotas-unico@example.com');
    await plan(owner);

    await expect(plan(owner, { count: 6 })).rejects.toThrow();
  });

  it.each([1, 37])('refuses %i installments', async (count) => {
    const owner = await createOwner(`cuotas-${String(count)}@example.com`);

    await expect(plan(owner, { count })).rejects.toThrow(/installment_plans_count_range/u);
  });

  it.each([2, 36])('accepts %i installments', async (count) => {
    const owner = await createOwner(`cuotas-ok-${String(count)}@example.com`);

    await expect(plan(owner, { count })).resolves.toMatchObject({ count });
  });

  it.each(['0.00', '-1.00'])('refuses a bank total of %s', async (totalAmount) => {
    const owner = await createOwner(`cuotas-total-${totalAmount}@example.com`);

    await expect(plan(owner, { totalAmount })).rejects.toThrow(
      /installment_plans_total_amount_positive/u,
    );
  });

  describe('never mixes accounts, even skipping the application', () => {
    it('refuses the card of another account', async () => {
      const ana = await createOwner('cuotas-ana@example.com');
      const bruno = await createOwner('cuotas-bruno@example.com');

      await expect(plan({ ...ana, card: bruno.card })).rejects.toThrow();
    });

    it('refuses the purchase of another account', async () => {
      const ana = await createOwner('cuotas-ana-2@example.com');
      const bruno = await createOwner('cuotas-bruno-2@example.com');

      await expect(plan({ ...ana, purchase: bruno.purchase })).rejects.toThrow();
    });
  });

  it('does not let a purchase with a plan be deleted for real', async () => {
    const owner = await createOwner('cuotas-borrar-compra@example.com');
    await plan(owner);

    await expect(prisma.transaction.delete({ where: { id: owner.purchase.id } })).rejects.toThrow();
  });

  it('goes away with its account', async () => {
    const owner = await createOwner('cuotas-cuenta@example.com');
    await plan(owner);

    await prisma.user.delete({ where: { id: owner.user.id } });

    await expect(prisma.installmentPlan.count({ where: { userId: owner.user.id } })).resolves.toBe(
      0,
    );
  });
});
