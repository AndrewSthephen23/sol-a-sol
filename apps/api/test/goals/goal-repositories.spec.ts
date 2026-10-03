import { LocalDate, Money } from '@sol-a-sol/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { PrismaGoalContributionRepository } from '../../src/modules/goals/infrastructure/prisma-goal-contribution-repository.js';
import { PrismaGoalRepository } from '../../src/modules/goals/infrastructure/prisma-goal-repository.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

// Valor obviamente falso: estas pruebas no tocan contraseñas.
const FAKE_HASH = 'fake';

/**
 * Los repositorios **solos**, sin el caso de uso delante: el caso de uso ya busca la meta por
 * cuenta antes de tocar sus aportes, y esa doble barrera escondería un filtro por `userId` roto
 * en el repositorio (lección de H5).
 */
describe('goal repositories keep each account apart', () => {
  let prisma: PrismaService;
  let goals: PrismaGoalRepository;
  let contributions: PrismaGoalContributionRepository;
  let ana: string;
  let bruno: string;
  let goalId: string;
  let contributionId: string;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
    goals = new PrismaGoalRepository(prisma);
    contributions = new PrismaGoalContributionRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['repo-ana@example.com', 'repo-bruno@example.com'] } },
    });
    ({ id: ana } = await prisma.user.create({
      data: { email: 'repo-ana@example.com', passwordHash: FAKE_HASH },
    }));
    ({ id: bruno } = await prisma.user.create({
      data: { email: 'repo-bruno@example.com', passwordHash: FAKE_HASH },
    }));
    ({ id: goalId } = await goals.create(ana, {
      name: 'Viaje a Cusco',
      target: Money.of('1200.00', 'PEN'),
      startDate: LocalDate.parse('2026-01-01'),
      endDate: LocalDate.parse('2026-12-31'),
    }));
    ({ id: contributionId } = await contributions.create(ana, {
      goalId,
      source: 'MANUAL',
      kind: 'CONTRIBUTION',
      amount: '300.00',
      date: LocalDate.parse('2026-09-15'),
    }));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['repo-ana@example.com', 'repo-bruno@example.com'] } },
    });
    await prisma.$disconnect();
  });

  it('reads back what it stores', async () => {
    const goal = await goals.find(ana, goalId);
    const [contribution] = await contributions.listByGoals(ana, [goalId]);

    expect(goal?.target.toFixed()).toBe('1200.00');
    expect(goal?.endDate.toString()).toBe('2026-12-31');
    expect(contribution).toMatchObject({ amount: '300.00', source: 'MANUAL' });
    expect(contribution?.source === 'MANUAL' && contribution.date.toString()).toBe('2026-09-15');
  });

  it('does not list, find or update the goal of another account', async () => {
    await expect(goals.list(bruno, { includeArchived: true })).resolves.toEqual([]);
    await expect(goals.find(bruno, goalId)).resolves.toBeNull();
    await expect(goals.update(bruno, goalId, { name: 'Mía' })).resolves.toBeNull();
    await expect(goals.find(ana, goalId)).resolves.toMatchObject({ name: 'Viaje a Cusco' });
  });

  it('does not list or delete the contributions of another account', async () => {
    await expect(contributions.listByGoals(bruno, [goalId])).resolves.toEqual([]);
    await expect(contributions.delete(bruno, goalId, contributionId)).resolves.toBe(false);
    await expect(contributions.listByGoals(ana, [goalId])).resolves.toHaveLength(1);
  });

  it('does not hang a contribution from the goal of another account', async () => {
    await expect(
      contributions.create(bruno, {
        goalId,
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: '1.00',
        date: LocalDate.parse('2026-09-15'),
      }),
    ).rejects.toThrow();
  });
});
