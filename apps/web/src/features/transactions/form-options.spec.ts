import { afterEach, describe, expect, it, vi } from 'vitest';

import { categoryGroups, lastPaymentMethod, paymentMethodOptions } from './form-options';
import type { Category, PaymentMethod } from './queries';

const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };
const ARCHIVED = '2026-09-01T00:00:00Z';

function category(
  id: string,
  name: string,
  type: Category['type'],
  children: Category['children'] = [],
  archivedAt: string | null = null,
): Category {
  return {
    id,
    name,
    type,
    parentId: null,
    color: '#000000',
    icon: 'tag',
    archivedAt,
    children,
    ...STAMPS,
  };
}

function child(
  id: string,
  name: string,
  archivedAt: string | null = null,
): Category['children'][number] {
  return {
    id,
    name,
    type: 'VARIABLE_EXPENSE',
    parentId: 'food',
    color: '#000000',
    icon: 'tag',
    archivedAt,
    ...STAMPS,
  };
}

const TREE: Category[] = [
  category('salary', 'Sueldo', 'INCOME'),
  category('food', 'Comida', 'VARIABLE_EXPENSE', [
    child('market', 'Mercado'),
    child('old', 'Antiguo', ARCHIVED),
  ]),
  category('cinema', 'Cine', 'VARIABLE_EXPENSE', [], ARCHIVED),
];

describe('categoryGroups', () => {
  it('groups the active categories by type, variable expenses first, with their subcategories', () => {
    expect(categoryGroups(TREE)).toEqual([
      {
        label: 'Gasto variable',
        options: [
          { id: 'food', label: 'Comida' },
          { id: 'market', label: 'Comida › Mercado' },
        ],
      },
      { label: 'Ingreso', options: [{ id: 'salary', label: 'Sueldo' }] },
    ]);
  });

  it('keeps an archived category that the movement being corrected already has', () => {
    const options = categoryGroups(TREE, 'old').flatMap((group) => group.options);

    expect(options).toContainEqual({ id: 'old', label: 'Comida › Antiguo' });
    expect(options).not.toContainEqual(expect.objectContaining({ id: 'cinema' }));
  });
});

describe('paymentMethodOptions', () => {
  const methods: PaymentMethod[] = [
    {
      id: 'bcp',
      alias: 'BCP',
      kind: 'ACCOUNT',
      institution: 'BCP',
      last4: null,
      currency: 'PEN',
      archivedAt: null,
      ...STAMPS,
    },
    {
      id: 'visa',
      alias: 'Visa',
      kind: 'CREDIT_CARD',
      institution: 'BCP',
      last4: '1234',
      currency: null,
      archivedAt: ARCHIVED,
      ...STAMPS,
    },
  ];

  it('offers the active ones, and an archived one only when it is already chosen', () => {
    expect(paymentMethodOptions(methods)).toEqual([{ id: 'bcp', label: 'BCP' }]);
    expect(paymentMethodOptions(methods, 'visa')).toContainEqual({
      id: 'visa',
      label: 'Visa ···· 1234 (archivado)',
    });
  });
});

describe('lastPaymentMethod', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.localStorage.clear();
  });

  it('remembers and forgets the last method used in this browser', () => {
    lastPaymentMethod.write('bcp');
    expect(lastPaymentMethod.read()).toBe('bcp');

    lastPaymentMethod.write(null);
    expect(lastPaymentMethod.read()).toBeNull();
  });

  it('does nothing when the browser has no storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => {
      lastPaymentMethod.write('bcp');
    }).not.toThrow();
    expect(lastPaymentMethod.read()).toBeNull();
  });
});
