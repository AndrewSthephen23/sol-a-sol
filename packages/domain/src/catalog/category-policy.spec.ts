import { describe, expect, it } from 'vitest';

import {
  ArchivedParentCategoryError,
  assertCanBeParent,
  assertCanRestore,
  assertCategoryColor,
  CategoryTooDeepError,
  CategoryTypeRequiredError,
  categoryNameKey,
  childrenArchivedWith,
  InvalidCategoryColorError,
  resolveCategoryType,
  SubcategoryTypeMismatchError,
} from './category-policy.js';

describe('categoryNameKey', () => {
  it.each([
    ['Comida', 'comida'],
    ['COMIDA', 'comida'],
    ['  Comida ', 'comida'],
    ['Café', 'cafe'],
    ['CAFÉ', 'cafe'],
    ['Árbol Índigo Útil Éxito Óleo', 'arbol indigo util exito oleo'],
    ['àèìòù', 'aeiou'],
    ['Pingüino Ärger Ëlla Ïsla Öde', 'pinguino arger ella isla ode'],
  ])('compares %j as %j', (name, key) => {
    expect(categoryNameKey(name)).toBe(key);
  });

  // La ñ no es una tilde: "Año" y "Ano" son palabras distintas.
  it('keeps the ñ, and lowers it', () => {
    expect(categoryNameKey('AÑO')).toBe('año');
    expect(categoryNameKey('Año')).not.toBe(categoryNameKey('Ano'));
  });
});

describe('resolveCategoryType', () => {
  it('uses the type that was sent for a top-level category', () => {
    expect(resolveCategoryType('SAVING', null)).toBe('SAVING');
  });

  it('asks for the type of a top-level category', () => {
    expect(() => resolveCategoryType(null, null)).toThrow(CategoryTypeRequiredError);
  });

  it('lets a subcategory inherit the type of its parent', () => {
    expect(resolveCategoryType(null, { type: 'FIXED_EXPENSE' })).toBe('FIXED_EXPENSE');
  });

  it('accepts the same type as the parent, sent explicitly', () => {
    expect(resolveCategoryType('FIXED_EXPENSE', { type: 'FIXED_EXPENSE' })).toBe('FIXED_EXPENSE');
  });

  // Un tipo distinto es un error, no un dato que se corrige en silencio.
  it('rejects a type different from the parent', () => {
    expect(() => resolveCategoryType('VARIABLE_EXPENSE', { type: 'FIXED_EXPENSE' })).toThrow(
      SubcategoryTypeMismatchError,
    );
  });
});

describe('assertCanBeParent', () => {
  it('accepts a top-level category as parent', () => {
    expect(() => {
      assertCanBeParent({ parentId: null });
    }).not.toThrow();
  });

  it('rejects a subcategory as parent: there is a single level', () => {
    expect(() => {
      assertCanBeParent({ parentId: 'food' });
    }).toThrow(CategoryTooDeepError);
  });
});

describe('assertCanRestore', () => {
  it('restores a top-level category', () => {
    expect(() => {
      assertCanRestore(null);
    }).not.toThrow();
  });

  it('restores a subcategory whose parent is active', () => {
    expect(() => {
      assertCanRestore({ archivedAt: null });
    }).not.toThrow();
  });

  // Si no, quedaría una hija activa colgando de una madre archivada.
  it('does not restore a subcategory whose parent is archived', () => {
    expect(() => {
      assertCanRestore({ archivedAt: new Date('2026-09-01T15:00:00.000Z') });
    }).toThrow(ArchivedParentCategoryError);
  });
});

describe('childrenArchivedWith', () => {
  const PARENT_ARCHIVED_AT = new Date('2026-09-20T15:00:00.000Z');

  it('returns only the children archived together with the parent', () => {
    const children = [
      { id: 'with-parent', archivedAt: new Date('2026-09-20T15:00:00.000Z') },
      { id: 'before', archivedAt: new Date('2026-08-01T15:00:00.000Z') },
      { id: 'active', archivedAt: null },
    ];

    expect(childrenArchivedWith(PARENT_ARCHIVED_AT, children)).toEqual(['with-parent']);
  });

  it('returns nothing when there are no children', () => {
    expect(childrenArchivedWith(PARENT_ARCHIVED_AT, [])).toEqual([]);
  });
});

describe('assertCategoryColor', () => {
  it.each(['#1E88E5', '#1e88e5', '#000000'])('accepts %s', (color) => {
    expect(() => {
      assertCategoryColor(color);
    }).not.toThrow();
  });

  it.each(['1E88E5', '#1E88E', '#1E88E5F', '#GGGGGG', 'blue', ' #1E88E5', ''])(
    'rejects %j',
    (color) => {
      expect(() => {
        assertCategoryColor(color);
      }).toThrow(InvalidCategoryColorError);
    },
  );
});

describe('errors', () => {
  it.each([
    ['CategoryTooDeepError', () => new CategoryTooDeepError(), 'CATEGORY_TOO_DEEP', /single level/],
    [
      'CategoryTypeRequiredError',
      () => new CategoryTypeRequiredError(),
      'CATEGORY_TYPE_REQUIRED',
      /needs a type/,
    ],
    [
      'SubcategoryTypeMismatchError',
      () => new SubcategoryTypeMismatchError(),
      'SUBCATEGORY_TYPE_MISMATCH',
      /type of its parent/,
    ],
    [
      'ArchivedParentCategoryError',
      () => new ArchivedParentCategoryError(),
      'PARENT_CATEGORY_ARCHIVED',
      /Restore the parent first/,
    ],
    [
      'InvalidCategoryColorError',
      () => new InvalidCategoryColorError(),
      'INVALID_CATEGORY_COLOR',
      /#RRGGBB/,
    ],
  ])('%s has a stable code and says which rule broke', (name, build, code, message) => {
    const error = build();

    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.name).toBe(name);
  });
});
