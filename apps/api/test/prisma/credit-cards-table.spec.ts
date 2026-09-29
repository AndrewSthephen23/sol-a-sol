import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';

describe('credit_cards table', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Una cuenta con una tarjeta bimoneda y una cuenta de ahorros. */
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
    const savings = await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        kind: 'ACCOUNT',
        alias: 'Ahorros',
        institution: 'BCP',
        currency: 'PEN',
      },
    });

    return { user, visa, savings };
  }

  function card(
    owner: { user: { id: string }; visa: { id: string } },
    extra: Record<string, unknown> = {},
  ) {
    return prisma.creditCard.create({
      data: {
        userId: owner.user.id,
        paymentMethodId: owner.visa.id,
        creditLimit: '5000.00',
        creditLimitCurrency: 'PEN',
        statementDay: 20,
        paymentDueRule: 'DAYS_AFTER_STATEMENT',
        dueDaysAfterStatement: 25,
        ...extra,
      },
    });
  }

  it('stores a card with its credit limit as an exact decimal', async () => {
    const owner = await createOwner('tarjeta-nueva@example.com');

    const created = await card(owner, { creditLimit: '1234567890123456.78' });

    expect(created.id).toMatch(UUID_V7);
    expect(created.kind).toBe('CREDIT_CARD');
    const [row] = await prisma.$queryRaw<{ line: string }[]>`
      SELECT credit_limit::text AS line FROM credit_cards WHERE id = ${created.id}::uuid
    `;
    expect(row?.line).toBe('1234567890123456.78');
  });

  it('keeps a single card per payment method', async () => {
    const owner = await createOwner('tarjeta-unica@example.com');

    await card(owner);

    await expect(card(owner, { statementDay: 5 })).rejects.toThrow();
  });

  it('refuses a payment method that is not a credit card', async () => {
    const owner = await createOwner('tarjeta-cuenta@example.com');

    await expect(card({ ...owner, visa: owner.savings })).rejects.toThrow();
  });

  it('refuses a kind other than CREDIT_CARD, even pointing at a matching method', async () => {
    const owner = await createOwner('tarjeta-kind@example.com');

    await expect(card({ ...owner, visa: owner.savings }, { kind: 'ACCOUNT' })).rejects.toThrow(
      /credit_cards_kind_is_credit_card/u,
    );
  });

  it('allows a zero credit limit and refuses a negative one', async () => {
    const zero = await createOwner('tarjeta-linea-cero@example.com');
    const negative = await createOwner('tarjeta-linea-negativa@example.com');

    await expect(card(zero, { creditLimit: '0.00' })).resolves.toMatchObject({});
    await expect(card(negative, { creditLimit: '-0.01' })).rejects.toThrow(
      /credit_cards_credit_limit_not_negative/u,
    );
  });

  it.each([0, 32])('refuses statement day %i', async (statementDay) => {
    const owner = await createOwner(`tarjeta-corte-${String(statementDay)}@example.com`);

    await expect(card(owner, { statementDay })).rejects.toThrow(
      /credit_cards_statement_day_range/u,
    );
  });

  it.each([1, 31])('accepts statement day %i', async (statementDay) => {
    const owner = await createOwner(`tarjeta-corte-ok-${String(statementDay)}@example.com`);

    await expect(card(owner, { statementDay })).resolves.toMatchObject({ statementDay });
  });

  describe('payment due rule', () => {
    it('accepts a fixed day of the month', async () => {
      const owner = await createOwner('tarjeta-dia-fijo@example.com');

      await expect(
        card(owner, {
          paymentDueRule: 'DAY_OF_MONTH',
          dueDaysAfterStatement: null,
          dueDayOfMonth: 5,
        }),
      ).resolves.toMatchObject({ dueDayOfMonth: 5 });
    });

    it.each([
      ['days after the statement without the days', { dueDaysAfterStatement: null }],
      ['days after the statement with a day of the month too', { dueDayOfMonth: 5 }],
      ['zero days after the statement', { dueDaysAfterStatement: 0 }],
      ['61 days after the statement', { dueDaysAfterStatement: 61 }],
      [
        'a day of the month without the day',
        { paymentDueRule: 'DAY_OF_MONTH', dueDaysAfterStatement: null },
      ],
      [
        'a day of the month with days after the statement too',
        { paymentDueRule: 'DAY_OF_MONTH', dueDayOfMonth: 5 },
      ],
      [
        'day 32 of the month',
        { paymentDueRule: 'DAY_OF_MONTH', dueDaysAfterStatement: null, dueDayOfMonth: 32 },
      ],
    ])('refuses %s', async (label, extra) => {
      const owner = await createOwner(`tarjeta-regla-${label.replaceAll(' ', '-')}@example.com`);

      await expect(card(owner, extra)).rejects.toThrow(/credit_cards_payment_due_rule_fields/u);
    });
  });

  describe('opening balance', () => {
    it('accepts one per currency with its date', async () => {
      const owner = await createOwner('tarjeta-saldo@example.com');

      const created = await card(owner, {
        openingBalancePen: '1200.50',
        openingBalanceUsd: '0.00',
        openingBalanceDate: new Date('2026-09-01'),
      });

      expect(created.openingBalancePen?.toFixed(2)).toBe('1200.50');
      expect(created.openingBalanceUsd?.toFixed(2)).toBe('0.00');
    });

    it('accepts a single currency with its date', async () => {
      const owner = await createOwner('tarjeta-saldo-usd@example.com');

      await expect(
        card(owner, { openingBalanceUsd: '80.00', openingBalanceDate: new Date('2026-09-01') }),
      ).resolves.toMatchObject({ openingBalancePen: null });
    });

    it.each([
      ['a balance without its date', { openingBalancePen: '100.00' }],
      ['a date without a balance', { openingBalanceDate: new Date('2026-09-01') }],
    ])('refuses %s', async (label, extra) => {
      const owner = await createOwner(`tarjeta-saldo-${label.replaceAll(' ', '-')}@example.com`);

      await expect(card(owner, extra)).rejects.toThrow(/credit_cards_opening_balance_has_date/u);
    });

    it.each([
      ['PEN', { openingBalancePen: '-0.01' }],
      ['USD', { openingBalanceUsd: '-0.01' }],
    ])('refuses a negative balance in %s', async (currency, extra) => {
      const owner = await createOwner(`tarjeta-saldo-negativo-${currency}@example.com`);

      await expect(
        card(owner, { ...extra, openingBalanceDate: new Date('2026-09-01') }),
      ).rejects.toThrow(/credit_cards_opening_balance_not_negative/u);
    });
  });

  it('refuses the payment method of another account, even skipping the application', async () => {
    const ana = await createOwner('tarjeta-ana@example.com');
    const bruno = await createOwner('tarjeta-bruno@example.com');

    await expect(card({ ...ana, visa: bruno.visa })).rejects.toThrow();
  });

  it('does not let a payment method with a card be deleted', async () => {
    const owner = await createOwner('tarjeta-borrar-metodo@example.com');
    await card(owner);

    await expect(prisma.paymentMethod.delete({ where: { id: owner.visa.id } })).rejects.toThrow();
  });

  it('goes away with its account', async () => {
    const owner = await createOwner('tarjeta-borrar-cuenta@example.com');
    await card(owner);

    await prisma.user.delete({ where: { id: owner.user.id } });

    await expect(prisma.creditCard.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
  });
});
