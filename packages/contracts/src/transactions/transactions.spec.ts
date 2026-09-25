import { describe, expect, it } from 'vitest';

import {
  createTransactionRequestSchema,
  CURSOR_MAX_LENGTH,
  listTransactionsQuerySchema,
  SEARCH_MAX_LENGTH,
  TRANSACTIONS_DEFAULT_LIMIT,
  TRANSACTIONS_MAX_LIMIT,
  MERCHANT_MAX_LENGTH,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  updateTransactionRequestSchema,
} from './transactions.js';

const LUNCH = {
  date: '2026-09-24',
  type: 'VARIABLE_EXPENSE',
  categoryId: '01999999-9999-7999-8999-000000000001',
  amount: '25.90',
  currency: 'PEN',
  description: 'Almuerzo',
  paymentMethodId: '01999999-9999-7999-8999-000000000002',
  merchant: 'TAMBO',
};

function accepts(body: object): boolean {
  return createTransactionRequestSchema.safeParse(body).success;
}

describe('create transaction request', () => {
  it('accepts a full transaction', () => {
    expect(createTransactionRequestSchema.parse(LUNCH)).toEqual(LUNCH);
  });

  it('needs only the date, type, category, amount and description', () => {
    const required = {
      date: LUNCH.date,
      type: LUNCH.type,
      categoryId: LUNCH.categoryId,
      amount: LUNCH.amount,
      description: LUNCH.description,
    };

    expect(createTransactionRequestSchema.parse(required)).toEqual(required);
  });

  it('accepts null for the payment method and the merchant', () => {
    expect(accepts({ ...LUNCH, paymentMethodId: null, merchant: null })).toBe(true);
  });

  it('trims the description and the merchant', () => {
    const parsed = createTransactionRequestSchema.parse({
      ...LUNCH,
      description: '  Almuerzo ',
      merchant: ' TAMBO  ',
    });

    expect(parsed).toMatchObject({ description: 'Almuerzo', merchant: 'TAMBO' });
  });

  describe('amount', () => {
    it.each(['25.90', '25', '0.01', '1234567890123456.00'])('accepts %j', (amount) => {
      expect(accepts({ ...LUNCH, amount })).toBe(true);
    });

    // Llegan al dominio, que dice qué regla rompen: signo o tercer decimal.
    it.each(['-25.90', '25.905', '0'])('leaves %j for the domain to judge', (amount) => {
      expect(accepts({ ...LUNCH, amount })).toBe(true);
    });

    it.each([
      ['a number, which already lost precision', 25.9],
      ['a thousands separator', '1,234.50'],
      ['a currency symbol', 'S/ 25.90'],
      ['a decimal comma', '25,90'],
      ['an exponent', '1e3'],
      ['a trailing dot', '25.'],
      ['more than NUMERIC(18,2) holds', '12345678901234567'],
      ['blank', ''],
    ])('rejects %s', (_case, amount) => {
      expect(accepts({ ...LUNCH, amount })).toBe(false);
    });
  });

  it.each(['24/09/2026', '2026-9-24', '2026-02-30', '2026-09-24T10:00:00Z'])(
    'rejects the date %j: only a real YYYY-MM-DD day',
    (date) => {
      expect(accepts({ ...LUNCH, date })).toBe(false);
    },
  );

  it.each(['', '   ', 'x'.repeat(TRANSACTION_DESCRIPTION_MAX_LENGTH + 1)])(
    'rejects the description %j',
    (description) => {
      expect(accepts({ ...LUNCH, description })).toBe(false);
    },
  );

  it.each(['', 'x'.repeat(MERCHANT_MAX_LENGTH + 1)])('rejects the merchant %j', (merchant) => {
    expect(accepts({ ...LUNCH, merchant })).toBe(false);
  });

  it.each([
    ['an unknown type', { type: 'EXPENSE' }],
    ['an unknown currency', { currency: 'EUR' }],
    ['a category that is not a UUID', { categoryId: '42' }],
    ['a payment method that is not a UUID', { paymentMethodId: '42' }],
  ])('rejects %s', (_case, change) => {
    expect(accepts({ ...LUNCH, ...change })).toBe(false);
  });

  // Quien llama no elige de quién es ni de dónde vino: eso lo pone la API.
  it.each([
    ['userId', { userId: '01999999-9999-7999-8999-000000000003' }],
    ['source', { source: 'IMPORT' }],
  ])('rejects a %s in the body', (_field, extra) => {
    expect(accepts({ ...LUNCH, ...extra })).toBe(false);
  });
});

describe('update transaction request', () => {
  function acceptsChange(body: object): boolean {
    return updateTransactionRequestSchema.safeParse(body).success;
  }

  it('accepts any single field', () => {
    for (const [field, value] of Object.entries(LUNCH)) {
      expect(acceptsChange({ [field]: value }), field).toBe(true);
    }
  });

  it('accepts a whole correction at once', () => {
    expect(updateTransactionRequestSchema.parse(LUNCH)).toEqual(LUNCH);
  });

  it('accepts taking out the payment method and the merchant', () => {
    expect(acceptsChange({ paymentMethodId: null, merchant: null })).toBe(true);
  });

  it('rejects an empty change', () => {
    expect(acceptsChange({})).toBe(false);
  });

  it.each([
    ['an amount sent as a number', { amount: 25.9 }],
    ['a blank description', { description: ' ' }],
    ['a null description', { description: null }],
    ['a null currency', { currency: null }],
    ['a null category', { categoryId: null }],
  ])('rejects %s', (_case, body) => {
    expect(acceptsChange(body)).toBe(false);
  });

  // El origen no se corrige: una importada sigue diciendo que vino de un CSV.
  it.each([
    ['source', { source: 'MANUAL' }],
    ['userId', { userId: '01999999-9999-7999-8999-000000000003' }],
    ['deletedAt', { deletedAt: null }],
  ])('rejects a %s in the body', (_field, body) => {
    expect(acceptsChange(body)).toBe(false);
  });
});

describe('list transactions query', () => {
  function parse(query: Record<string, string>) {
    return listTransactionsQuerySchema.safeParse(query);
  }

  it('needs nothing, and then pages by the default limit', () => {
    expect(listTransactionsQuerySchema.parse({})).toEqual({ limit: TRANSACTIONS_DEFAULT_LIMIT });
  });

  it('accepts every filter together', () => {
    const query = {
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'VARIABLE_EXPENSE',
      categoryId: LUNCH.categoryId,
      paymentMethodId: LUNCH.paymentMethodId,
      currency: 'PEN',
      q: 'tambo',
      cursor: 'opaque',
      limit: '20',
    };

    expect(listTransactionsQuerySchema.parse(query)).toEqual({ ...query, limit: 20 });
  });

  it('accepts a month', () => {
    expect(parse({ month: '2026-09' }).success).toBe(true);
  });

  it.each(['2026-9', '2026-13', '2026-00', '09-2026', '2026-09-01'])(
    'rejects the month %j',
    (month) => {
      expect(parse({ month }).success).toBe(false);
    },
  );

  it.each<Record<string, string>>([{ from: '2026-09-01' }, { to: '2026-09-30' }])(
    'rejects a month together with from or to',
    (range) => {
      expect(parse({ month: '2026-09', ...range }).success).toBe(false);
    },
  );

  it('accepts a single day, and only from or only to', () => {
    expect(parse({ from: '2026-09-01', to: '2026-09-01' }).success).toBe(true);
    expect(parse({ from: '2026-09-01' }).success).toBe(true);
    expect(parse({ to: '2026-09-01' }).success).toBe(true);
  });

  it('rejects from after to', () => {
    expect(parse({ from: '2026-09-02', to: '2026-09-01' }).success).toBe(false);
  });

  // Pedir más no revienta la base: se recorta.
  it('cuts a limit above the maximum', () => {
    expect(listTransactionsQuerySchema.parse({ limit: '100000' }).limit).toBe(
      TRANSACTIONS_MAX_LIMIT,
    );
  });

  it.each(['0', '-1', '1.5', 'diez', ''])('rejects the limit %j', (limit) => {
    expect(parse({ limit }).success).toBe(false);
  });

  it('trims the search and rejects it blank or too long', () => {
    expect(listTransactionsQuerySchema.parse({ q: '  tambo ' }).q).toBe('tambo');
    expect(parse({ q: '   ' }).success).toBe(false);
    expect(parse({ q: 'x'.repeat(SEARCH_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it('rejects a cursor too long to be ours', () => {
    expect(parse({ cursor: 'x'.repeat(CURSOR_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it.each([
    ['type', 'EXPENSE'],
    ['currency', 'EUR'],
    ['categoryId', '42'],
    ['paymentMethodId', '42'],
  ])('rejects the %s %j', (field, value) => {
    expect(parse({ [field]: value }).success).toBe(false);
  });
});
