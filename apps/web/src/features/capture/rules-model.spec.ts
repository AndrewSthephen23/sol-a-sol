import { describe, expect, it } from 'vitest';

import type { Category } from '@/features/transactions/queries';

import type { Capture } from './capture-model';
import { checkRule, type Rule, ruleBehind, ruleErrorFor, ruleValuesFor } from './rules-model';

const CATEGORIES = [
  { id: 'viveres', name: 'Víveres', type: 'VARIABLE_EXPENSE', archivedAt: null, children: [] },
  { id: 'comida', name: 'Comida', type: 'VARIABLE_EXPENSE', archivedAt: null, children: [] },
  { id: 'vieja', name: 'Vieja', type: 'VARIABLE_EXPENSE', archivedAt: '2026-01-01', children: [] },
] as unknown as Category[];

const TAMBO: Rule = { id: 'regla-tambo', pattern: 'Tambo', categoryId: 'viveres', priority: 0 };

function capture(extra: Partial<Capture> = {}): Capture {
  return {
    type: 'VARIABLE_EXPENSE',
    merchant: 'TAMBÓ Larco',
    categoryId: 'viveres',
    raw: null,
    ...extra,
  } as Capture;
}

describe('ruleBehind', () => {
  it('finds the rule that gives the category the capture has', () => {
    expect(ruleBehind(capture(), [TAMBO], CATEGORIES)).toBe(TAMBO);
  });

  it('reads the text of the notification when there is no merchant', () => {
    expect(
      ruleBehind(
        capture({ merchant: null, raw: { rawText: 'Compra en TAMBO' } }),
        [TAMBO],
        CATEGORIES,
      ),
    ).toBe(TAMBO);
  });

  it('says nothing when the category was chosen by hand', () => {
    expect(ruleBehind(capture({ categoryId: 'comida' }), [TAMBO], CATEGORIES)).toBeNull();
  });

  it('says nothing without a category', () => {
    expect(ruleBehind(capture({ categoryId: null }), [TAMBO], CATEGORIES)).toBeNull();
  });

  it('names the winning rule when several apply', () => {
    const specific: Rule = { ...TAMBO, id: 'regla-larco', pattern: 'Tambo Larco', priority: 0 };

    expect(ruleBehind(capture(), [TAMBO, specific], CATEGORIES)).toBe(specific);
  });

  it('skips a rule whose category is archived or gone', () => {
    const archived: Rule = { ...TAMBO, id: 'archivada', categoryId: 'vieja', priority: 9 };
    const gone: Rule = { ...TAMBO, id: 'perdida', categoryId: 'no-existe', priority: 9 };

    expect(ruleBehind(capture(), [archived, gone, TAMBO], CATEGORIES)).toBe(TAMBO);
  });
});

describe('checkRule', () => {
  it('builds the body, trimming the pattern', () => {
    expect(checkRule({ pattern: ' Tambo ', categoryId: 'viveres', priority: '3' })).toEqual({
      body: { pattern: 'Tambo', categoryId: 'viveres', priority: 3 },
    });
  });

  it('starts a new rule with priority 0', () => {
    expect(ruleValuesFor(null)).toEqual({ pattern: '', categoryId: '', priority: '0' });
    expect(ruleValuesFor(TAMBO)).toEqual({
      pattern: 'Tambo',
      categoryId: 'viveres',
      priority: '0',
    });
  });

  it.each([
    ['a blank pattern', { pattern: '  ' }, 'pattern'],
    ['no category', { categoryId: '' }, 'categoryId'],
    ['a negative priority', { priority: '-1' }, 'priority'],
    ['a fractional priority', { priority: '1.5' }, 'priority'],
    ['a priority too big', { priority: '9999999999' }, 'priority'],
    ['no priority', { priority: '' }, 'priority'],
  ])('refuses %s, next to its field', (_label, extra, field) => {
    const checked = checkRule({ pattern: 'Tambo', categoryId: 'viveres', priority: '0', ...extra });

    expect('errors' in checked ? Object.keys(checked.errors) : []).toEqual([field]);
  });
});

describe('ruleErrorFor', () => {
  it('puts a repeated pattern next to the pattern', () => {
    expect(ruleErrorFor('RULE_PATTERN_TAKEN')).toEqual({
      field: 'pattern',
      message: 'Ya tienes una regla para ese texto: corrige esa.',
    });
  });

  it('puts an archived category next to the category', () => {
    expect(ruleErrorFor('CATEGORY_ARCHIVED')).toEqual({
      field: 'categoryId',
      message: 'Esa categoría está archivada.',
    });
  });

  it('leaves the rest above the form', () => {
    expect(ruleErrorFor('TRANSACTION_DATE_IN_FUTURE')).toEqual({
      message: 'La fecha no puede ser futura.',
    });
    expect(ruleErrorFor('ALGO')).toBeNull();
    expect(ruleErrorFor(null)).toBeNull();
  });
});
