import { describe, expect, it } from 'vitest';

import { importPreviewRequestSchema, importRequestSchema } from './import.js';

describe('import preview request', () => {
  it('accepts the file as text', () => {
    expect(importPreviewRequestSchema.parse({ csv: 'fecha,tipo\n' })).toEqual({
      csv: 'fecha,tipo\n',
    });
  });

  it.each([{}, { csv: '' }, { csv: 42 }, { csv: 'a', userId: 'b' }])('rejects %j', (body) => {
    expect(importPreviewRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('import request', () => {
  const ID = '01999999-9999-7999-8999-000000000001';

  function accepts(body: object): boolean {
    return importRequestSchema.safeParse(body).success;
  }

  it('needs only the file, with no decisions', () => {
    expect(importRequestSchema.parse({ csv: 'x' })).toEqual({
      csv: 'x',
      categories: [],
      paymentMethods: [],
    });
  });

  it('accepts every kind of decision', () => {
    expect(
      accepts({
        csv: 'x',
        categories: [
          {
            type: 'VARIABLE_EXPENSE',
            category: 'Compras',
            subcategory: 'Poncho',
            action: 'create',
          },
          {
            type: 'FIXED_EXPENSE',
            category: 'Servicios',
            subcategory: 'Bitel',
            action: 'use',
            categoryId: ID,
          },
          { type: 'FIXED_EXPENSE', category: 'Netflix', subcategory: null, action: 'restore' },
        ],
        paymentMethods: [
          { alias: 'Yape', action: 'create', kind: 'WALLET', institution: 'BCP', currency: 'PEN' },
          { alias: 'Transferencia', action: 'use', paymentMethodId: ID },
          { alias: 'Visa vieja', action: 'restore' },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    [
      'a category to use without its id',
      { categories: [{ type: 'INCOME', category: 'X', subcategory: null, action: 'use' }] },
    ],
    [
      'an unknown action',
      { categories: [{ type: 'INCOME', category: 'X', subcategory: null, action: 'ignore' }] },
    ],
    [
      'a created method without its kind',
      { paymentMethods: [{ alias: 'Yape', action: 'create' }] },
    ],
    [
      'a method to use with an id that is not a UUID',
      { paymentMethods: [{ alias: 'Yape', action: 'use', paymentMethodId: 'yape' }] },
    ],
    [
      'a created method with a CVV',
      { paymentMethods: [{ alias: 'Visa', action: 'create', kind: 'CREDIT_CARD', cvv: '123' }] },
    ],
    ['a userId', { userId: ID }],
  ])('rejects %s', (_case, change) => {
    expect(accepts({ csv: 'x', ...change })).toBe(false);
  });
});
