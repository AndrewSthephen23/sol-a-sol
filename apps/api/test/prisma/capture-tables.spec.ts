import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { Prisma } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';
const LOOKS = { color: '#1E88E5', icon: 'utensils' };
/** Un pedido como el que manda el atajo, inventado con la forma de uno real. */
const RAW = { source: 'IOS_SHORTCUT', amountText: 'S/ 25.90', merchant: 'TAMBO', card: '4242' };
/** Una captura descartada desde la bandeja, con su fecha y de dónde vino. */
const DISCARDED = { status: 'DISCARDED', discardedAt: new Date(), discardedFrom: 'PENDING' };

describe('captures and categorization_rules tables', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Una cuenta con una categoría de gasto variable, una de ingreso, una tarjeta y un gasto. */
  async function createOwner(email: string) {
    const user = await prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
    const groceries = await prisma.category.create({
      data: { userId: user.id, type: 'VARIABLE_EXPENSE', name: 'Víveres', ...LOOKS },
    });
    const salary = await prisma.category.create({
      data: { userId: user.id, type: 'INCOME', name: 'Honorarios', ...LOOKS },
    });
    const card = await prisma.paymentMethod.create({
      data: { userId: user.id, kind: 'CREDIT_CARD', alias: 'Visa BCP', last4: '4242' },
    });
    const expense = await createExpense(user.id, groceries.id);

    return { user, groceries, salary, card, expense };
  }

  function createExpense(userId: string, categoryId: string, extra: Record<string, unknown> = {}) {
    return prisma.transaction.create({
      data: {
        userId,
        categoryId,
        type: 'VARIABLE_EXPENSE',
        date: new Date('2026-10-02T00:00:00.000Z'),
        amount: '25.90',
        currency: 'PEN',
        description: 'TAMBO',
        source: 'IOS_SHORTCUT',
        ...extra,
      },
    });
  }

  let keys = 0;

  function createCapture(userId: string, extra: Record<string, unknown> = {}) {
    keys += 1;
    return prisma.capture.create({
      data: {
        userId,
        source: 'IOS_SHORTCUT',
        rawPayload: RAW,
        // 21:30 de Lima del 2 de octubre: en UTC ya es el 3.
        occurredAt: new Date('2026-10-03T02:30:00.000Z'),
        businessDate: new Date('2026-10-02T00:00:00.000Z'),
        idempotencyKey: `clave-${String(keys)}`,
        ...extra,
      },
    });
  }

  /** Una captura confirmada: sin texto crudo y con su transacción. */
  function confirmed(owner: { user: { id: string }; expense: { id: string } }) {
    return createCapture(owner.user.id, {
      status: 'CONFIRMED',
      rawPayload: Prisma.DbNull,
      transactionId: owner.expense.id,
    });
  }

  describe('captures', () => {
    it('stores a pending capture as it arrived, with its amount as an exact decimal', async () => {
      const owner = await createOwner('captura-nueva@example.com');

      const created = await createCapture(owner.user.id, {
        amount: '1234567890123456.78',
        currency: 'PEN',
        merchant: 'TAMBO',
        cardLast4: '4242',
        paymentMethodId: owner.card.id,
        categoryId: owner.groceries.id,
        warnings: ['FUTURE_DATE'],
      });

      expect(created.id).toMatch(UUID_V7);
      expect(created).toMatchObject({
        status: 'PENDING',
        type: 'VARIABLE_EXPENSE',
        rawPayload: RAW,
        warnings: ['FUTURE_DATE'],
        transactionId: null,
        discardedAt: null,
      });
      const [row] = await prisma.$queryRaw<{ amount: string; day: string }[]>`
        SELECT amount::text AS amount, business_date::text AS day
        FROM captures WHERE id = ${created.id}::uuid
      `;
      expect(row).toEqual({ amount: '1234567890123456.78', day: '2026-10-02' });
    });

    it('stores a capture it did not understand at all, with no warnings by default', async () => {
      const owner = await createOwner('captura-sin-entender@example.com');

      await expect(
        createCapture(owner.user.id, { rawPayload: { rawText: 'algo raro' } }),
      ).resolves.toMatchObject({ amount: null, currency: null, merchant: null, warnings: [] });
    });

    it('accepts an amount without a currency, to choose it in the inbox', async () => {
      const owner = await createOwner('captura-sin-moneda@example.com');

      await expect(createCapture(owner.user.id, { amount: '25.90' })).resolves.toMatchObject({
        currency: null,
      });
    });

    it('refuses a list of warnings that is not there', async () => {
      const owner = await createOwner('captura-avisos-nulos@example.com');
      const capture = await createCapture(owner.user.id);

      await expect(
        prisma.$executeRaw`UPDATE captures SET warnings = NULL WHERE id = ${capture.id}::uuid`,
      ).rejects.toThrow(/captures_warnings_not_null/u);
    });

    it.each(['0.00', '-0.01'])('refuses an amount of %s', async (amount) => {
      const owner = await createOwner(`captura-monto-${amount}@example.com`);

      await expect(createCapture(owner.user.id, { amount, currency: 'PEN' })).rejects.toThrow(
        /captures_amount_positive/u,
      );
    });

    it.each(['424', '42424', '42a2', '4242 4242 4242 4242'])(
      'refuses %s as the last 4 digits',
      async (cardLast4) => {
        const owner = await createOwner(
          `captura-last4-${cardLast4.replaceAll(' ', '-')}@example.com`,
        );

        await expect(createCapture(owner.user.id, { cardLast4 })).rejects.toThrow(
          /captures_card_last4_format/u,
        );
      },
    );

    it('refuses a blank idempotency key', async () => {
      const owner = await createOwner('captura-clave-vacia@example.com');

      await expect(createCapture(owner.user.id, { idempotencyKey: '  ' })).rejects.toThrow(
        /captures_idempotency_key_not_blank/u,
      );
    });

    it('keeps the idempotency key unique per account', async () => {
      const owner = await createOwner('captura-clave-repetida@example.com');
      await createCapture(owner.user.id, { idempotencyKey: 'reintento' });

      await expect(createCapture(owner.user.id, { idempotencyKey: 'reintento' })).rejects.toThrow(
        /idempotency_key/u,
      );
    });

    it('lets another account use the same idempotency key', async () => {
      const ana = await createOwner('captura-clave-ana@example.com');
      const bruno = await createOwner('captura-clave-bruno@example.com');
      await createCapture(ana.user.id, { idempotencyKey: 'la-misma' });

      await expect(
        createCapture(bruno.user.id, { idempotencyKey: 'la-misma' }),
      ).resolves.toMatchObject({ idempotencyKey: 'la-misma' });
    });

    it.each([
      ['missing', Prisma.DbNull],
      ['a JSON null', Prisma.JsonNull],
      ['not an object', ['S/ 25.90']],
    ])('refuses a pending capture whose raw payload is %s', async (label, rawPayload) => {
      const owner = await createOwner(`captura-crudo-${label.replaceAll(' ', '-')}@example.com`);

      await expect(createCapture(owner.user.id, { rawPayload })).rejects.toThrow(
        /captures_raw_payload_until_confirmed/u,
      );
    });

    it('stores a confirmed capture with its transaction and without its raw payload', async () => {
      const owner = await createOwner('captura-confirmada@example.com');

      await expect(confirmed(owner)).resolves.toMatchObject({
        status: 'CONFIRMED',
        rawPayload: null,
        transactionId: owner.expense.id,
      });
    });

    it('refuses a confirmed capture that keeps its raw payload', async () => {
      const owner = await createOwner('captura-confirmada-con-crudo@example.com');

      await expect(
        createCapture(owner.user.id, { status: 'CONFIRMED', transactionId: owner.expense.id }),
      ).rejects.toThrow(/captures_raw_payload_until_confirmed/u);
    });

    it.each([
      ['a confirmed capture without its transaction', 'CONFIRMED', false],
      ['a pending capture with a transaction', 'PENDING', true],
      ['a duplicate with a transaction', 'DUPLICATE', true],
    ])('refuses %s', async (label, status, withTransaction) => {
      const owner = await createOwner(`captura-estado-${label.replaceAll(' ', '-')}@example.com`);

      const create = createCapture(owner.user.id, {
        status,
        ...(status === 'CONFIRMED' && { rawPayload: Prisma.DbNull }),
        ...(withTransaction && { transactionId: owner.expense.id }),
      });

      await expect(create).rejects.toThrow(/captures_confirmed_has_transaction/u);
    });

    it.each(['PENDING', 'DUPLICATE'])(
      'stores a discarded capture with the moment it was discarded, from %s',
      async (discardedFrom) => {
        const owner = await createOwner(`captura-descartada-${discardedFrom}@example.com`);

        await expect(
          createCapture(owner.user.id, { ...DISCARDED, discardedFrom }),
        ).resolves.toMatchObject({ status: 'DISCARDED', discardedFrom, rawPayload: RAW });
      },
    );

    it.each([
      ['a discarded capture without its date', 'DISCARDED', null, 'PENDING'],
      ['a pending capture with a discard date', 'PENDING', new Date(), null],
    ])('refuses %s', async (label, status, discardedAt, discardedFrom) => {
      const owner = await createOwner(`captura-descarte-${label.replaceAll(' ', '-')}@example.com`);

      await expect(
        createCapture(owner.user.id, { status, discardedAt, discardedFrom }),
      ).rejects.toThrow(/captures_discarded_has_date/u);
    });

    it.each([
      ['a discarded capture without its origin', 'DISCARDED', new Date(), null],
      ['a pending capture with an origin', 'PENDING', null, 'PENDING'],
    ])('refuses %s', async (label, status, discardedAt, discardedFrom) => {
      const owner = await createOwner(`captura-origen-${label.replaceAll(' ', '-')}@example.com`);

      await expect(
        createCapture(owner.user.id, { status, discardedAt, discardedFrom }),
      ).rejects.toThrow(/captures_discarded_has_origin/u);
    });

    it.each(['CONFIRMED', 'DISCARDED'])(
      'refuses a capture discarded from %s, which never was in the inbox',
      async (discardedFrom) => {
        const owner = await createOwner(`captura-origen-${discardedFrom}@example.com`);

        await expect(createCapture(owner.user.id, { ...DISCARDED, discardedFrom })).rejects.toThrow(
          /captures_discarded_from_inbox/u,
        );
      },
    );

    it('refuses a category of another type, even skipping the application', async () => {
      const owner = await createOwner('captura-categoria-otro-tipo@example.com');

      await expect(
        createCapture(owner.user.id, { type: 'INCOME', categoryId: owner.groceries.id }),
      ).rejects.toThrow(/captures_category_id_user_id_type_fkey/u);
    });

    it('refuses the category of another account, even skipping the application', async () => {
      const ana = await createOwner('captura-categoria-ana@example.com');
      const bruno = await createOwner('captura-categoria-bruno@example.com');

      await expect(createCapture(ana.user.id, { categoryId: bruno.groceries.id })).rejects.toThrow(
        /captures_category_id_user_id_type_fkey/u,
      );
    });

    it('refuses the payment method of another account, even skipping the application', async () => {
      const ana = await createOwner('captura-metodo-ana@example.com');
      const bruno = await createOwner('captura-metodo-bruno@example.com');

      await expect(createCapture(ana.user.id, { paymentMethodId: bruno.card.id })).rejects.toThrow(
        /captures_payment_method_id_user_id_fkey/u,
      );
    });

    it('refuses the transaction of another account, even skipping the application', async () => {
      const ana = await createOwner('captura-transaccion-ana@example.com');
      const bruno = await createOwner('captura-transaccion-bruno@example.com');

      await expect(confirmed({ ...ana, expense: bruno.expense })).rejects.toThrow(
        /captures_transaction_id_user_id_fkey/u,
      );
    });

    it('gives a transaction to a single capture', async () => {
      const owner = await createOwner('captura-una-transaccion@example.com');
      await confirmed(owner);

      await expect(confirmed(owner)).rejects.toThrow(/transaction_id/u);
    });

    it('does not let its transaction be deleted for good', async () => {
      const owner = await createOwner('captura-borrar-transaccion@example.com');
      await confirmed(owner);

      await expect(prisma.transaction.delete({ where: { id: owner.expense.id } })).rejects.toThrow(
        /captures_transaction_id_user_id_fkey/u,
      );
    });
  });

  describe('transactions.capture_id', () => {
    it('links a transaction to the capture it came from', async () => {
      const owner = await createOwner('transaccion-de-captura@example.com');
      const capture = await createCapture(owner.user.id);

      await expect(
        createExpense(owner.user.id, owner.groceries.id, { captureId: capture.id }),
      ).resolves.toMatchObject({ captureId: capture.id });
    });

    it('refuses a capture that does not exist', async () => {
      const owner = await createOwner('transaccion-captura-inexistente@example.com');

      await expect(
        createExpense(owner.user.id, owner.groceries.id, {
          captureId: '01900000-0000-7000-8000-000000000000',
        }),
      ).rejects.toThrow(/transactions_capture_id_user_id_fkey/u);
    });

    it('refuses the capture of another account, even skipping the application', async () => {
      const ana = await createOwner('transaccion-captura-ana@example.com');
      const bruno = await createOwner('transaccion-captura-bruno@example.com');
      const theirs = await createCapture(bruno.user.id);

      await expect(
        createExpense(ana.user.id, ana.groceries.id, { captureId: theirs.id }),
      ).rejects.toThrow(/transactions_capture_id_user_id_fkey/u);
    });

    it('takes a single transaction out of a capture', async () => {
      const owner = await createOwner('transaccion-una-captura@example.com');
      const capture = await createCapture(owner.user.id);
      await createExpense(owner.user.id, owner.groceries.id, { captureId: capture.id });

      await expect(
        createExpense(owner.user.id, owner.groceries.id, { captureId: capture.id }),
      ).rejects.toThrow(/capture_id/u);
    });

    it('does not delete the transaction along with its capture', async () => {
      const owner = await createOwner('transaccion-sobrevive@example.com');
      const capture = await createCapture(owner.user.id);
      await createExpense(owner.user.id, owner.groceries.id, { captureId: capture.id });

      await expect(prisma.capture.delete({ where: { id: capture.id } })).rejects.toThrow(
        /transactions_capture_id_user_id_fkey/u,
      );
    });
  });

  describe('categorization_rules', () => {
    function createRule(userId: string, categoryId: string, extra: Record<string, unknown> = {}) {
      return prisma.categorizationRule.create({
        data: { userId, categoryId, pattern: 'Tambo', patternKey: 'tambo', ...extra },
      });
    }

    it('stores a rule with priority 0 by default', async () => {
      const owner = await createOwner('regla-nueva@example.com');

      const created = await createRule(owner.user.id, owner.groceries.id);

      expect(created.id).toMatch(UUID_V7);
      expect(created).toMatchObject({ pattern: 'Tambo', patternKey: 'tambo', priority: 0 });
    });

    it('points to a category of any type', async () => {
      const owner = await createOwner('regla-ingreso@example.com');

      await expect(
        createRule(owner.user.id, owner.salary.id, { pattern: 'Te yapeó', patternKey: 'te yapeo' }),
      ).resolves.toMatchObject({ categoryId: owner.salary.id });
    });

    it('keeps a single rule per pattern and account', async () => {
      const owner = await createOwner('regla-repetida@example.com');
      await createRule(owner.user.id, owner.groceries.id);

      await expect(
        createRule(owner.user.id, owner.salary.id, { pattern: 'TAMBO' }),
      ).rejects.toThrow(/pattern_key/u);
    });

    it('lets another account use the same pattern', async () => {
      const ana = await createOwner('regla-patron-ana@example.com');
      const bruno = await createOwner('regla-patron-bruno@example.com');
      await createRule(ana.user.id, ana.groceries.id);

      await expect(createRule(bruno.user.id, bruno.groceries.id)).resolves.toMatchObject({});
    });

    it.each([
      ['a blank pattern', { pattern: '   ' }],
      ['a blank pattern key', { patternKey: ' ' }],
    ])('refuses %s', async (label, extra) => {
      const owner = await createOwner(`regla-${label.replaceAll(' ', '-')}@example.com`);

      await expect(createRule(owner.user.id, owner.groceries.id, extra)).rejects.toThrow(
        /categorization_rules_pattern_not_blank/u,
      );
    });

    it('refuses a negative priority', async () => {
      const owner = await createOwner('regla-prioridad-negativa@example.com');

      await expect(createRule(owner.user.id, owner.groceries.id, { priority: -1 })).rejects.toThrow(
        /categorization_rules_priority_not_negative/u,
      );
    });

    it('refuses the category of another account, even skipping the application', async () => {
      const ana = await createOwner('regla-categoria-ana@example.com');
      const bruno = await createOwner('regla-categoria-bruno@example.com');

      await expect(createRule(ana.user.id, bruno.groceries.id)).rejects.toThrow(
        /categorization_rules_category_id_user_id_fkey/u,
      );
    });
  });

  it('captures, rules and the transactions they link go away with their account', async () => {
    const owner = await createOwner('captura-borrar-cuenta@example.com');
    // Enlazadas en las dos direcciones, como quedan al confirmar.
    const capture = await confirmed(owner);
    await prisma.transaction.update({
      where: { id: owner.expense.id },
      data: { captureId: capture.id },
    });
    await createCapture(owner.user.id, DISCARDED);
    await prisma.categorizationRule.create({
      data: {
        userId: owner.user.id,
        categoryId: owner.groceries.id,
        pattern: 'Tambo',
        patternKey: 'tambo',
      },
    });

    await prisma.user.delete({ where: { id: owner.user.id } });

    await expect(prisma.capture.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
    await expect(
      prisma.categorizationRule.count({ where: { userId: owner.user.id } }),
    ).resolves.toBe(0);
    await expect(prisma.transaction.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
  });
});
