import { describe, expect, it } from 'vitest';

import {
  categorizationRuleParamsSchema,
  createCategorizationRuleRequestSchema,
  RULE_PATTERN_MAX_LENGTH,
  updateCategorizationRuleRequestSchema,
} from './categorization-rules.js';

const ID = '01999999-9999-7999-8999-000000000001';

describe('createCategorizationRuleRequestSchema', () => {
  it('accepts a rule, trims its pattern and gives it priority 0 by default', () => {
    expect(
      createCategorizationRuleRequestSchema.parse({ pattern: '  Tambo ', categoryId: ID }),
    ).toEqual({ pattern: 'Tambo', categoryId: ID, priority: 0 });
  });

  it('accepts any priority of zero or more', () => {
    expect(
      createCategorizationRuleRequestSchema.parse({
        pattern: 'Tambo',
        categoryId: ID,
        priority: 900,
      }).priority,
    ).toBe(900);
  });

  it.each([
    ['a blank pattern', { pattern: '   ', categoryId: ID }],
    ['a pattern too long', { pattern: 'x'.repeat(RULE_PATTERN_MAX_LENGTH + 1), categoryId: ID }],
    ['a category that is not a UUID', { pattern: 'Tambo', categoryId: 'viveres' }],
    ['a negative priority', { pattern: 'Tambo', categoryId: ID, priority: -1 }],
    ['a fractional priority', { pattern: 'Tambo', categoryId: ID, priority: 1.5 }],
    ['a priority as text', { pattern: 'Tambo', categoryId: ID, priority: '1' }],
    [
      'a field per rule, which they all share',
      { pattern: 'Tambo', categoryId: ID, matchField: 'MERCHANT' },
    ],
  ])('rejects %s', (_label, body) => {
    expect(createCategorizationRuleRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateCategorizationRuleRequestSchema', () => {
  it('changes only what comes', () => {
    expect(updateCategorizationRuleRequestSchema.parse({ priority: 3 })).toEqual({ priority: 3 });
  });

  it.each([
    ['nothing to change', {}],
    ['a blank pattern', { pattern: ' ' }],
    ['a userId', { userId: ID }],
  ])('rejects %s', (_label, body) => {
    expect(updateCategorizationRuleRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('categorizationRuleParamsSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(categorizationRuleParamsSchema.safeParse({ id: ID }).success).toBe(true);
    expect(categorizationRuleParamsSchema.safeParse({ id: 'regla' }).success).toBe(false);
  });
});
