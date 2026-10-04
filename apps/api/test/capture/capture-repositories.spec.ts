import { LocalDate } from '@sol-a-sol/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { PrismaCaptureRepository } from '../../src/modules/capture/infrastructure/prisma-capture-repository.js';
import { PrismaCategorizationRuleRepository } from '../../src/modules/capture/infrastructure/prisma-categorization-rule-repository.js';
import {
  IdempotencyKeyTakenError,
  type NewCapture,
} from '../../src/modules/capture/ports/capture-repository.js';
import { RulePatternTakenError } from '../../src/modules/capture/ports/categorization-rule-repository.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';
const AT = new Date('2026-10-03T16:30:00.000Z');
const EMAILS = ['captura-repo-ana@example.com', 'captura-repo-bruno@example.com'];

const CAPTURE: NewCapture = {
  source: 'IOS_SHORTCUT',
  status: 'PENDING',
  type: 'VARIABLE_EXPENSE',
  occurredAt: AT,
  businessDate: LocalDate.parse('2026-10-03'),
  amount: { value: '25.90', currency: null },
  merchant: 'Tambo',
  cardLast4: '4242',
  description: null,
  categoryId: null,
  paymentMethodId: null,
  warnings: ['UNKNOWN_SOURCE'],
  rawPayload: { source: 'IOS_SHORTCUT', amountText: '25.90' },
  idempotencyKey: 'la-misma',
};

/**
 * Los repositorios solos, sin el caso de uso delante: cada consulta filtra por cuenta aunque nada
 * más lo note (una regla ajena se descartaría después, porque su categoría no es de la cuenta).
 */
describe('capture repositories', () => {
  let prisma: PrismaService;
  let captures: PrismaCaptureRepository;
  let rules: PrismaCategorizationRuleRepository;
  let ana: string;
  let bruno: string;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
    captures = new PrismaCaptureRepository(prisma);
    rules = new PrismaCategorizationRuleRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    ana = (
      await prisma.user.create({
        data: { email: 'captura-repo-ana@example.com', passwordHash: FAKE_HASH },
      })
    ).id;
    bruno = (
      await prisma.user.create({
        data: { email: 'captura-repo-bruno@example.com', passwordHash: FAKE_HASH },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.$disconnect();
  });

  it('saves a capture and reads it back by its key, with an amount without a currency', async () => {
    const created = await captures.create(ana, CAPTURE);

    await expect(captures.findByIdempotencyKey(ana, 'la-misma')).resolves.toEqual(created);
    expect(created).toMatchObject({
      amount: { value: '25.90', currency: null },
      businessDate: LocalDate.parse('2026-10-03'),
      warnings: ['UNKNOWN_SOURCE'],
    });
  });

  it('turns a repeated key into IdempotencyKeyTakenError', async () => {
    await captures.create(ana, CAPTURE);

    await expect(captures.create(ana, CAPTURE)).rejects.toBeInstanceOf(IdempotencyKeyTakenError);
  });

  it('finds a key only in its own account', async () => {
    await captures.create(ana, CAPTURE);

    await expect(captures.findByIdempotencyKey(bruno, 'la-misma')).resolves.toBeNull();
  });

  it('lists the captures of the account between two instants, both included', async () => {
    const atStart = await captures.create(ana, { ...CAPTURE, idempotencyKey: 'a' });
    await captures.create(ana, {
      ...CAPTURE,
      idempotencyKey: 'b',
      occurredAt: new Date(AT.getTime() + 121_000),
    });
    await captures.create(bruno, { ...CAPTURE, idempotencyKey: 'c' });

    const found = await captures.listOccurredBetween(ana, AT, new Date(AT.getTime() + 120_000));

    expect(found.map((capture) => capture.id)).toEqual([atStart.id]);
  });

  /** Descartada hace mucho, directo en la base. */
  function discard(id: string) {
    return prisma.capture.update({
      where: { id },
      data: {
        status: 'DISCARDED',
        discardedAt: new Date('2026-01-01T00:00:00.000Z'),
        discardedFrom: 'PENDING',
      },
    });
  }

  it('finds a capture only in its own account', async () => {
    const created = await captures.create(ana, CAPTURE);

    await expect(captures.find(ana, created.id)).resolves.toMatchObject({
      id: created.id,
      rawPayload: CAPTURE.rawPayload,
      discardedFrom: null,
    });
    await expect(captures.find(bruno, created.id)).resolves.toBeNull();
  });

  it('lists a page of the account in those statuses, newest first', async () => {
    const older = await captures.create(ana, { ...CAPTURE, idempotencyKey: 'a' });
    const newer = await captures.create(ana, {
      ...CAPTURE,
      idempotencyKey: 'b',
      status: 'DUPLICATE',
      occurredAt: new Date(AT.getTime() + 60_000),
    });
    const discarded = await captures.create(ana, { ...CAPTURE, idempotencyKey: 'c' });
    await discard(discarded.id);
    await captures.create(bruno, { ...CAPTURE, idempotencyKey: 'd' });

    const first = await captures.list(ana, ['PENDING', 'DUPLICATE'], { after: null, limit: 1 });
    const second = await captures.list(ana, ['PENDING', 'DUPLICATE'], {
      after: { occurredAt: newer.occurredAt, id: newer.id },
      limit: 5,
    });

    expect(first.map(({ id }) => id)).toEqual([newer.id]);
    expect(second.map(({ id }) => id)).toEqual([older.id]);
  });

  it('updates a capture only in its own account and in the expected status', async () => {
    const created = await captures.create(ana, CAPTURE);

    await expect(
      captures.update(bruno, created.id, { merchant: 'Ajeno' }, ['PENDING']),
    ).resolves.toBeNull();
    // El UPDATE mismo filtra por cuenta: no basta con que la respuesta salga vacía.
    await expect(captures.find(ana, created.id)).resolves.toMatchObject({ merchant: 'Tambo' });
    await expect(
      captures.update(ana, created.id, { merchant: 'Otro' }, ['DUPLICATE']),
    ).resolves.toBeNull();
    await expect(
      captures.update(
        ana,
        created.id,
        { merchant: 'Wong', amount: { value: '30.00', currency: 'USD' } },
        ['PENDING'],
      ),
    ).resolves.toMatchObject({ merchant: 'Wong', amount: { value: '30.00', currency: 'USD' } });
  });

  it('deletes the old discarded captures only in its own account', async () => {
    const mine = await captures.create(ana, { ...CAPTURE, idempotencyKey: 'a' });
    const theirs = await captures.create(bruno, { ...CAPTURE, idempotencyKey: 'b' });
    await discard(mine.id);
    await discard(theirs.id);

    await expect(captures.deleteDiscardedBefore(ana, AT)).resolves.toBe(1);

    await expect(captures.find(bruno, theirs.id)).resolves.not.toBeNull();
  });

  async function categoryOf(userId: string, name = 'Víveres') {
    return prisma.category.create({
      data: { userId, type: 'VARIABLE_EXPENSE', name, color: '#E53935', icon: 'cart' },
    });
  }

  it('lists the uncategorized captures of the inbox, only in its own account', async () => {
    const waiting = await captures.create(ana, { ...CAPTURE, idempotencyKey: 'a' });
    const category = await categoryOf(ana);
    await captures.create(ana, { ...CAPTURE, idempotencyKey: 'b', categoryId: category.id });
    await captures.create(bruno, { ...CAPTURE, idempotencyKey: 'c' });

    const found = await captures.listUncategorizedInInbox(ana);

    expect(found.map(({ id }) => id)).toEqual([waiting.id]);
  });

  it('moves the unconfirmed captures of a category, only in its own account', async () => {
    const [from, into] = [await categoryOf(ana), await categoryOf(ana, 'Mercado')];
    const theirFrom = await categoryOf(bruno);
    const mine = await captures.create(ana, {
      ...CAPTURE,
      idempotencyKey: 'a',
      categoryId: from.id,
    });
    const theirs = await captures.create(bruno, {
      ...CAPTURE,
      idempotencyKey: 'b',
      categoryId: theirFrom.id,
    });

    // Otra cuenta pidiendo mover las categorías de Ana no mueve nada.
    await expect(captures.reassignCategory(bruno, from.id, into.id)).resolves.toBe(0);
    await expect(captures.find(ana, mine.id)).resolves.toMatchObject({ categoryId: from.id });
    await expect(captures.reassignCategory(ana, from.id, into.id)).resolves.toBe(1);

    await expect(captures.find(ana, mine.id)).resolves.toMatchObject({ categoryId: into.id });
    await expect(captures.find(bruno, theirs.id)).resolves.toMatchObject({
      categoryId: theirFrom.id,
    });
  });

  it('finds, changes and deletes a rule only in its own account', async () => {
    const category = await categoryOf(ana);
    const rule = await rules.create(ana, {
      pattern: 'Tambo',
      patternKey: 'tambo',
      categoryId: category.id,
      priority: 0,
    });

    await expect(rules.find(bruno, rule.id)).resolves.toBeNull();
    await expect(rules.update(bruno, rule.id, { priority: 9 })).resolves.toBeNull();
    await expect(rules.delete(bruno, rule.id)).resolves.toBe(false);
    // El UPDATE y el DELETE mismos filtran por cuenta: no basta con la respuesta.
    await expect(rules.find(ana, rule.id)).resolves.toMatchObject({ priority: 0 });
  });

  it('turns a repeated pattern into RulePatternTakenError', async () => {
    const category = await categoryOf(ana);
    const fields = { pattern: 'Tambo', patternKey: 'tambo', categoryId: category.id, priority: 0 };
    await rules.create(ana, fields);
    const other = await rules.create(ana, { ...fields, pattern: 'Wong', patternKey: 'wong' });

    await expect(rules.create(ana, fields)).rejects.toBeInstanceOf(RulePatternTakenError);
    await expect(rules.update(ana, other.id, { patternKey: 'tambo' })).rejects.toBeInstanceOf(
      RulePatternTakenError,
    );
  });

  it('moves the rules of a category, only in its own account', async () => {
    const [from, into] = [await categoryOf(ana), await categoryOf(ana, 'Mercado')];
    const theirFrom = await categoryOf(bruno);
    const fields = { pattern: 'Tambo', patternKey: 'tambo', priority: 0 };
    const mine = await rules.create(ana, { ...fields, categoryId: from.id });
    const theirs = await rules.create(bruno, { ...fields, categoryId: theirFrom.id });

    await expect(rules.reassignCategory(bruno, from.id, into.id)).resolves.toBe(0);
    await expect(rules.find(ana, mine.id)).resolves.toMatchObject({ categoryId: from.id });
    await expect(rules.reassignCategory(ana, from.id, into.id)).resolves.toBe(1);

    await expect(rules.find(ana, mine.id)).resolves.toMatchObject({ categoryId: into.id });
    await expect(rules.find(bruno, theirs.id)).resolves.toMatchObject({
      categoryId: theirFrom.id,
    });
  });

  it('lists only the rules of the account', async () => {
    const category = await prisma.category.create({
      data: {
        userId: ana,
        type: 'VARIABLE_EXPENSE',
        name: 'Víveres',
        color: '#E53935',
        icon: 'cart',
      },
    });
    await prisma.categorizationRule.create({
      data: { userId: ana, pattern: 'Tambo', patternKey: 'tambo', categoryId: category.id },
    });

    await expect(rules.list(ana)).resolves.toMatchObject([
      { pattern: 'Tambo', patternKey: 'tambo', categoryId: category.id, priority: 0 },
    ]);
    await expect(rules.list(bruno)).resolves.toEqual([]);
  });
});
