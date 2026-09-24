import { describe, expect, it } from 'vitest';

import {
  CATEGORY_COLOR_MAX_LENGTH,
  CATEGORY_ICON_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  createCategoryRequestSchema,
  listCategoriesQuerySchema,
  updateCategoryRequestSchema,
} from './categories.js';

const PARENT_ID = '01999999-9999-7999-8999-999999999999';
const FOOD = { name: 'Comida', type: 'VARIABLE_EXPENSE', color: '#1E88E5', icon: 'utensils' };

describe('create category request', () => {
  it('accepts a top-level category with its type, color and icon', () => {
    expect(createCategoryRequestSchema.parse(FOOD)).toEqual(FOOD);
  });

  it('accepts a subcategory with only its name and parent', () => {
    const body = { name: 'Delivery', parentId: PARENT_ID };

    expect(createCategoryRequestSchema.parse(body)).toEqual(body);
  });

  it('trims the name', () => {
    expect(createCategoryRequestSchema.parse({ ...FOOD, name: '  Comida ' }).name).toBe('Comida');
  });

  it.each(['', '   '])('rejects a blank name (%j)', (name) => {
    expect(createCategoryRequestSchema.safeParse({ ...FOOD, name }).success).toBe(false);
  });

  it.each([
    ['name', CATEGORY_NAME_MAX_LENGTH],
    ['color', CATEGORY_COLOR_MAX_LENGTH],
    ['icon', CATEGORY_ICON_MAX_LENGTH],
  ])('rejects a %s past the defensive limit', (field, max) => {
    expect(
      createCategoryRequestSchema.safeParse({ ...FOOD, [field]: 'a'.repeat(max + 1) }).success,
    ).toBe(false);
  });

  it.each(['GIFT', 'income', 'Gasto variable'])('rejects %j as the type', (type) => {
    expect(createCategoryRequestSchema.safeParse({ ...FOOD, type }).success).toBe(false);
  });

  it('rejects a parent that is not a UUID', () => {
    expect(createCategoryRequestSchema.safeParse({ ...FOOD, parentId: 'comida' }).success).toBe(
      false,
    );
  });

  it.each(['Utensils', 'shopping cart', 'shopping--cart', '-cart', '🍔'])(
    'rejects %j as the icon: it is a kebab-case name',
    (icon) => {
      expect(createCategoryRequestSchema.safeParse({ ...FOOD, icon }).success).toBe(false);
    },
  );

  // Que sea #RRGGBB lo decide el dominio (INVALID_CATEGORY_COLOR): aquí solo se mira la forma.
  it('leaves the color format to the domain', () => {
    expect(createCategoryRequestSchema.safeParse({ ...FOOD, color: 'azul' }).success).toBe(true);
  });

  it.each(['userId', 'archivedAt'])('rejects an unknown field (%s)', (field) => {
    expect(createCategoryRequestSchema.safeParse({ ...FOOD, [field]: 'x' }).success).toBe(false);
  });
});

describe('update category request', () => {
  it('accepts any subset of the editable fields', () => {
    expect(updateCategoryRequestSchema.parse({ name: 'Mercado' })).toEqual({ name: 'Mercado' });
    expect(updateCategoryRequestSchema.parse({ archived: false })).toEqual({ archived: false });
  });

  it('rejects an empty change', () => {
    expect(updateCategoryRequestSchema.safeParse({}).success).toBe(false);
  });

  // Las transacciones quedarían con otro tipo que su categoría.
  it.each([
    ['the type', { type: 'INCOME' }],
    ['the parent', { parentId: PARENT_ID }],
  ])('rejects a change of %s', (_case, body) => {
    expect(updateCategoryRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('list categories query', () => {
  it('lists every type, without the archived ones, by default', () => {
    expect(listCategoriesQuerySchema.parse({})).toEqual({ includeArchived: false });
  });

  it('filters by type and includes the archived ones when asked', () => {
    expect(listCategoriesQuerySchema.parse({ type: 'SAVING', includeArchived: 'true' })).toEqual({
      type: 'SAVING',
      includeArchived: true,
    });
  });

  it.each([
    ['an unknown type', { type: 'GIFT' }],
    ['includeArchived=1', { includeArchived: '1' }],
  ])('rejects %s instead of guessing', (_case, query) => {
    expect(listCategoriesQuerySchema.safeParse(query).success).toBe(false);
  });
});
