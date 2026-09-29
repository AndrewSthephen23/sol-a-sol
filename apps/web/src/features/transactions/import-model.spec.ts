import { describe, expect, it } from 'vitest';

import {
  categoryKey,
  checkDecisions,
  type ImportPreview,
  importErrorMessage,
  importRequest,
  type MethodChoice,
  proposedDecisions,
  rowProblemMessage,
} from './import-model';

const PREVIEW: ImportPreview = {
  rows: 4,
  transactions: 3,
  transfers: 1,
  alreadyImported: [],
  problems: [],
  ignoredColumns: [],
  categories: [
    {
      type: 'VARIABLE_EXPENSE',
      category: 'Comida',
      subcategory: 'Delivery',
      status: 'missing',
      lines: [2, 3],
    },
    { type: 'INCOME', category: 'Sueldo', subcategory: null, status: 'archived', lines: [4] },
  ],
  paymentMethods: [
    { alias: 'Visa Oro', status: 'missing', lines: [2] },
    { alias: 'Yape', status: 'archived', lines: [5] },
  ],
  newTags: [],
};

const DELIVERY = categoryKey({
  type: 'VARIABLE_EXPENSE',
  category: 'Comida',
  subcategory: 'Delivery',
});
const SALARY = categoryKey({ type: 'INCOME', category: 'Sueldo', subcategory: null });

function card(overrides: Partial<Extract<MethodChoice, { action: 'create' }>> = {}): MethodChoice {
  return {
    action: 'create',
    kind: 'CREDIT_CARD',
    institution: 'BCP',
    last4: '1234',
    currency: 'BOTH',
    ...overrides,
  };
}

describe('rowProblemMessage', () => {
  it('translates a known problem and never shows the English message', () => {
    const problem = {
      line: 3,
      field: 'fecha',
      code: 'INVALID_LOCAL_DATE',
      message: 'Invalid date',
    };

    expect(rowProblemMessage(problem)).toBe('La fecha va como AAAA-MM-DD, por ejemplo 2026-09-17.');
    expect(rowProblemMessage({ ...problem, code: 'SOMETHING_NEW' })).toBe(
      'Este valor no es válido.',
    );
  });
});

describe('importErrorMessage', () => {
  it('translates what can go wrong with the whole file', () => {
    expect(importErrorMessage('IMPORT_CONFLICT')).toContain('no se guardó nada');
    expect(importErrorMessage('SOMETHING_NEW')).toBeNull();
    expect(importErrorMessage(null)).toBeNull();
  });
});

describe('proposedDecisions', () => {
  it('proposes creating what is missing and restoring what is archived', () => {
    expect(proposedDecisions(PREVIEW)).toEqual({
      categories: { [DELIVERY]: { action: 'create' }, [SALARY]: { action: 'restore' } },
      methods: {
        'Visa Oro': { action: 'create', kind: '', institution: '', last4: '', currency: '' },
        Yape: { action: 'restore' },
      },
    });
  });
});

describe('checkDecisions', () => {
  it('accepts complete decisions', () => {
    expect(checkDecisions({ [DELIVERY]: { action: 'create' } }, { 'Visa Oro': card() })).toEqual(
      {},
    );
  });

  it('asks to choose what to use instead', () => {
    expect(
      checkDecisions(
        { [DELIVERY]: { action: 'use', categoryId: '' } },
        { Yape: { action: 'use', paymentMethodId: '' } },
      ),
    ).toEqual({ [DELIVERY]: 'Elige una categoría.', Yape: 'Elige un método de pago.' });
  });

  it.each([
    ['no kind', card({ kind: '' }), 'Elige qué tipo de método es.'],
    ['no currency', card({ currency: '' }), 'Elige la moneda.'],
    [
      'a card without its last 4 digits',
      card({ last4: '' }),
      'Una tarjeta de crédito necesita sus últimos 4 dígitos.',
    ],
    [
      'more than 4 digits, never cut',
      card({ last4: '4111111111111111' }),
      'Los últimos dígitos son exactamente 4 números.',
    ],
    [
      'last digits on a wallet',
      card({ kind: 'WALLET', currency: 'PEN' }),
      'Este tipo de método no tiene últimos 4 dígitos.',
    ],
    [
      'an account taking both currencies',
      card({ kind: 'ACCOUNT', currency: 'BOTH' }),
      'Una cuenta o billetera guarda una sola moneda: elígela.',
    ],
  ])('rejects a new method with %s, with the rules of the domain', (_case, choice, message) => {
    expect(checkDecisions({}, { 'Visa Oro': choice })).toEqual({ 'Visa Oro': message });
  });

  it('ignores the bank written for cash, which has none', () => {
    expect(
      checkDecisions({}, { Caja: card({ kind: 'CASH', last4: '', institution: 'BCP' }) }),
    ).toEqual({});
  });
});

describe('importRequest', () => {
  it('sends the same file with one decision per pending item', () => {
    expect(
      importRequest(
        'csv',
        PREVIEW,
        {
          [DELIVERY]: { action: 'use', categoryId: '11111111-1111-4111-8111-111111111111' },
          [SALARY]: { action: 'restore' },
        },
        {
          'Visa Oro': card({ institution: ' BCP ' }),
          Yape: { action: 'use', paymentMethodId: '22222222-2222-4222-8222-222222222222' },
        },
      ),
    ).toEqual({
      csv: 'csv',
      categories: [
        {
          type: 'VARIABLE_EXPENSE',
          category: 'Comida',
          subcategory: 'Delivery',
          action: 'use',
          categoryId: '11111111-1111-4111-8111-111111111111',
        },
        { type: 'INCOME', category: 'Sueldo', subcategory: null, action: 'restore' },
      ],
      paymentMethods: [
        {
          alias: 'Visa Oro',
          action: 'create',
          kind: 'CREDIT_CARD',
          institution: 'BCP',
          last4: '1234',
          currency: null,
        },
        { alias: 'Yape', action: 'use', paymentMethodId: '22222222-2222-4222-8222-222222222222' },
      ],
    });
  });

  it('creates cash without a bank, and leaves out what has no decision', () => {
    const request = importRequest(
      'csv',
      PREVIEW,
      {},
      {
        'Visa Oro': card({ kind: 'CASH', institution: 'BCP', last4: '', currency: 'PEN' }),
        Yape: card({ kind: '' }),
      },
    );

    expect(request.categories).toEqual([]);
    expect(request.paymentMethods).toEqual([
      {
        alias: 'Visa Oro',
        action: 'create',
        kind: 'CASH',
        institution: null,
        last4: null,
        currency: 'PEN',
      },
    ]);
  });
});
