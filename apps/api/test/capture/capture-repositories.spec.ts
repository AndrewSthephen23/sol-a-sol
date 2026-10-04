import { LocalDate } from '@sol-a-sol/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { PrismaCaptureRepository } from '../../src/modules/capture/infrastructure/prisma-capture-repository.js';
import { PrismaCategorizationRuleRepository } from '../../src/modules/capture/infrastructure/prisma-categorization-rule-repository.js';
import {
  IdempotencyKeyTakenError,
  type NewCapture,
} from '../../src/modules/capture/ports/capture-repository.js';
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
