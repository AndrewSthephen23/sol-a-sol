import { describe, expect, it } from 'vitest';

import {
  createGoalContributionRequestSchema,
  createGoalRequestSchema,
  GOAL_NAME_MAX_LENGTH,
  goalContributionParamsSchema,
  goalParamsSchema,
  listGoalsQuerySchema,
  updateGoalRequestSchema,
} from './goals.js';

const ID = '01999999-9999-7999-8999-000000000001';
const GOAL = {
  name: 'Viaje a Cusco',
  currency: 'PEN',
  targetAmount: '3000.00',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

describe('createGoalRequestSchema', () => {
  it('accepts a goal', () => {
    expect(createGoalRequestSchema.parse(GOAL)).toEqual(GOAL);
  });

  it('trims the name', () => {
    expect(createGoalRequestSchema.parse({ ...GOAL, name: '  Laptop  ' }).name).toBe('Laptop');
  });

  it('leaves the rules to the domain, which says which one broke', () => {
    const body = { ...GOAL, targetAmount: '-1.00', endDate: '2025-01-01' };

    expect(createGoalRequestSchema.safeParse(body).success).toBe(true);
  });

  it.each([
    ['a userId in the body', { ...GOAL, userId: ID }],
    ['an empty name', { ...GOAL, name: '   ' }],
    ['a name too long', { ...GOAL, name: 'x'.repeat(GOAL_NAME_MAX_LENGTH + 1) }],
    ['a target as a number', { ...GOAL, targetAmount: 3000 }],
    ['another currency', { ...GOAL, currency: 'EUR' }],
    ['a date that is not ISO', { ...GOAL, startDate: '01/01/2026' }],
    ['no end date', { ...GOAL, endDate: undefined }],
  ])('rejects %s', (_label, body) => {
    expect(createGoalRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateGoalRequestSchema', () => {
  it.each([
    [{ name: 'Laptop' }],
    [{ targetAmount: '2500.00', endDate: '2027-06-30' }],
    [{ archived: true }],
  ])('accepts a partial change: %o', (body) => {
    expect(updateGoalRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['nothing to change', {}],
    ['a currency: it stays fixed', { currency: 'USD' }],
    ['a userId', { userId: ID }],
    ['archived as text', { archived: 'true' }],
  ])('rejects %s', (_label, body) => {
    expect(updateGoalRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('listGoalsQuerySchema', () => {
  it('leaves the archived ones out by default', () => {
    expect(listGoalsQuerySchema.parse({})).toEqual({ includeArchived: false });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads includeArchived=%s', (value, expected) => {
    expect(listGoalsQuerySchema.parse({ includeArchived: value })).toEqual({
      includeArchived: expected,
    });
  });

  it.each(['1', 'yes', 'TRUE'])('rejects includeArchived=%s instead of guessing', (value) => {
    expect(listGoalsQuerySchema.safeParse({ includeArchived: value }).success).toBe(false);
  });
});

describe('createGoalContributionRequestSchema', () => {
  it.each(['CONTRIBUTION', 'WITHDRAWAL'])('accepts a manual %s', (kind) => {
    const body = { source: 'MANUAL', kind, amount: '250.00', date: '2026-09-15' };

    expect(createGoalContributionRequestSchema.parse(body)).toEqual(body);
  });

  it('accepts a contribution linked to a transaction', () => {
    const body = { source: 'TRANSACTION', transactionId: ID };

    expect(createGoalContributionRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['a manual one without its date', { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '1.00' }],
    [
      'a manual one with a transaction',
      {
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: '1.00',
        date: '2026-09-15',
        transactionId: ID,
      },
    ],
    ['a linked one with an amount', { source: 'TRANSACTION', transactionId: ID, amount: '1.00' }],
    ['a linked withdrawal', { source: 'TRANSACTION', transactionId: ID, kind: 'WITHDRAWAL' }],
    ['a transaction id that is not a UUID', { source: 'TRANSACTION', transactionId: '42' }],
    [
      'an amount as a number',
      {
        source: 'MANUAL',
        kind: 'CONTRIBUTION',
        amount: 250,
        date: '2026-09-15',
      },
    ],
    ['no source', { kind: 'CONTRIBUTION', amount: '1.00', date: '2026-09-15' }],
    ['a userId', { source: 'TRANSACTION', transactionId: ID, userId: ID }],
  ])('rejects %s', (_label, body) => {
    expect(createGoalContributionRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('route params', () => {
  it('accepts UUIDs', () => {
    expect(goalParamsSchema.parse({ id: ID })).toEqual({ id: ID });
    expect(goalContributionParamsSchema.parse({ id: ID, contributionId: ID })).toEqual({
      id: ID,
      contributionId: ID,
    });
  });

  it('rejects ids that are not UUIDs', () => {
    expect(goalParamsSchema.safeParse({ id: '42' }).success).toBe(false);
    expect(goalContributionParamsSchema.safeParse({ id: ID, contributionId: '42' }).success).toBe(
      false,
    );
  });
});
