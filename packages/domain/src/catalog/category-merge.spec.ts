import { describe, expect, it } from 'vitest';

import { ArchivedParentCategoryError, CategoryTooDeepError } from './category-policy.js';
import {
  assertCanConvertToTag,
  CategoryMergeIntoOwnChildError,
  CategoryMergeSameError,
  CategoryMergeTypeMismatchError,
  type MergeableCategory,
  OnlySubcategoriesConvertError,
  planCategoryMerge,
} from './category-merge.js';

function category(
  id: string,
  name: string,
  change: Partial<MergeableCategory> = {},
): MergeableCategory {
  return { id, name, type: 'VARIABLE_EXPENSE', parentId: null, archivedAt: null, ...change };
}

const SHOPPING = category('shopping', 'Compras');
const CLOTHES = category('clothes', 'Ropa');
const PONCHO = category('poncho', 'Poncho', { parentId: 'shopping' });
const TEMU = category('temu', 'Temu', { parentId: 'shopping' });
const SHIRTS = category('shirts', 'Camisas', { parentId: 'clothes' });
const FOOD = category('food', 'Comida');
const SODA = category('soda', 'Gaseosa', { parentId: 'food' });
const DRINKS = category('drinks', 'Bebidas', { parentId: 'food' });

describe('planCategoryMerge', () => {
  it('merges a subcategory into a sibling', () => {
    expect(planCategoryMerge(SODA, DRINKS, [], [])).toEqual({
      merges: [{ fromId: 'soda', intoId: 'drinks' }],
      moves: [],
    });
  });

  // "Comida > Desayuno" → "Comida": sus transacciones quedan en la madre.
  it('merges a subcategory into its own parent', () => {
    expect(planCategoryMerge(SODA, FOOD, [], [])).toEqual({
      merges: [{ fromId: 'soda', intoId: 'food' }],
      moves: [],
    });
  });

  // Decidido con el autor el 2026-09-28: las hijas se mudan con su madre.
  it('moves the children of a merged category under the destination', () => {
    expect(planCategoryMerge(SHOPPING, CLOTHES, [PONCHO, TEMU], [SHIRTS])).toEqual({
      merges: [{ fromId: 'shopping', intoId: 'clothes' }],
      moves: [
        { id: 'poncho', parentId: 'clothes' },
        { id: 'temu', parentId: 'clothes' },
      ],
    });
  });

  it('merges a child into the child of the destination with the same name', () => {
    const shirts = category('old-shirts', 'CAMISÁS', { parentId: 'shopping' });

    expect(planCategoryMerge(SHOPPING, CLOTHES, [PONCHO, shirts], [SHIRTS])).toEqual({
      merges: [
        { fromId: 'shopping', intoId: 'clothes' },
        { fromId: 'old-shirts', intoId: 'shirts' },
      ],
      moves: [{ id: 'poncho', parentId: 'clothes' }],
    });
  });

  it('merges a top-level category without children into a subcategory', () => {
    expect(planCategoryMerge(SHOPPING, SHIRTS, [], [])).toEqual({
      merges: [{ fromId: 'shopping', intoId: 'shirts' }],
      moves: [],
    });
  });

  // Volver a fusionar una ya archivada recupera lo que un oyente no alcanzó a mover.
  it('accepts an archived origin', () => {
    const archived = { ...SODA, archivedAt: new Date('2026-09-28T00:00:00Z') };

    expect(planCategoryMerge(archived, DRINKS, [], []).merges).toEqual([
      { fromId: 'soda', intoId: 'drinks' },
    ]);
  });

  it('rejects merging a category into itself', () => {
    expect(() => planCategoryMerge(FOOD, FOOD, [], [])).toThrow(CategoryMergeSameError);
  });

  it('rejects merging into a category of another type', () => {
    expect(() =>
      planCategoryMerge(SHOPPING, category('rent', 'Alquiler', { type: 'FIXED_EXPENSE' }), [], []),
    ).toThrow(CategoryMergeTypeMismatchError);
  });

  it('rejects merging into an archived destination', () => {
    expect(() =>
      planCategoryMerge(SODA, { ...DRINKS, archivedAt: new Date('2026-09-28T00:00:00Z') }, [], []),
    ).toThrow(ArchivedParentCategoryError);
  });

  it('rejects merging a category into one of its own children', () => {
    expect(() => planCategoryMerge(FOOD, SODA, [SODA, DRINKS], [])).toThrow(
      CategoryMergeIntoOwnChildError,
    );
  });

  // Sus hijas quedarían colgando de una subcategoría: dos niveles.
  it('rejects merging a category with children into a subcategory', () => {
    expect(() => planCategoryMerge(SHOPPING, SHIRTS, [PONCHO], [])).toThrow(CategoryTooDeepError);
  });
});

describe('assertCanConvertToTag', () => {
  // "Comida > Desayuno" → "Comida" con la etiqueta "Desayuno" (decidido el 2026-09-28).
  it('accepts a subcategory', () => {
    expect(() => {
      assertCanConvertToTag(SODA);
    }).not.toThrow();
  });

  // Una de primer nivel no tiene madre a donde llevar sus transacciones.
  it('rejects a top-level category', () => {
    expect(() => {
      assertCanConvertToTag(FOOD);
    }).toThrow(OnlySubcategoriesConvertError);
  });
});

describe('errors', () => {
  it.each([
    ['CategoryMergeSameError', () => new CategoryMergeSameError(), 'CATEGORY_MERGE_SAME', /itself/],
    [
      'CategoryMergeTypeMismatchError',
      () => new CategoryMergeTypeMismatchError(),
      'CATEGORY_MERGE_TYPE_MISMATCH',
      /same type/,
    ],
    [
      'CategoryMergeIntoOwnChildError',
      () => new CategoryMergeIntoOwnChildError(),
      'CATEGORY_MERGE_INTO_OWN_CHILD',
      /own subcategories/,
    ],
    [
      'OnlySubcategoriesConvertError',
      () => new OnlySubcategoriesConvertError(),
      'ONLY_SUBCATEGORIES_CONVERT',
      /only a subcategory/i,
    ],
  ])('%s has a stable code and says which rule broke', (name, build, code, message) => {
    const error = build();

    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.name).toBe(name);
  });
});
