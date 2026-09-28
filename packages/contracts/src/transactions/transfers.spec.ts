import { describe, expect, it } from 'vitest';

import { TRANSACTION_DESCRIPTION_MAX_LENGTH } from './transactions.js';
import { createTransferRequestSchema } from './transfers.js';

const CHANGE = {
  date: '2026-09-10',
  fromPaymentMethodId: '01999999-9999-7999-8999-000000000001',
  toPaymentMethodId: '01999999-9999-7999-8999-000000000002',
  amount: '37.50',
  currency: 'PEN',
  receivedAmount: '10.00',
  receivedCurrency: 'USD',
  description: 'Cambio para Netflix',
};

function accepts(body: object): boolean {
  return createTransferRequestSchema.safeParse(body).success;
}

describe('create transfer request', () => {
  it('accepts a currency change with both amounts', () => {
    expect(createTransferRequestSchema.parse(CHANGE)).toEqual(CHANGE);
  });

  it('needs only the date, both accounts, the amount and the description', () => {
    const required = {
      date: CHANGE.date,
      fromPaymentMethodId: CHANGE.fromPaymentMethodId,
      toPaymentMethodId: CHANGE.toPaymentMethodId,
      amount: '50.00',
      description: 'Paso a Yape',
    };

    expect(createTransferRequestSchema.parse(required)).toEqual(required);
  });

  it('trims the description', () => {
    expect(createTransferRequestSchema.parse({ ...CHANGE, description: ' Cambio ' })).toMatchObject(
      { description: 'Cambio' },
    );
  });

  // Llegan al dominio, que dice qué regla rompen.
  it.each(['-10.00', '10.005', '0'])('leaves the received amount %j to the domain', (amount) => {
    expect(accepts({ ...CHANGE, receivedAmount: amount })).toBe(true);
  });

  it.each([
    ['an amount sent as a number', { amount: 37.5 }],
    ['a received amount sent as a number', { receivedAmount: 10 }],
    ['a received amount with a comma', { receivedAmount: '10,00' }],
    ['an unknown currency', { receivedCurrency: 'EUR' }],
    ['an origin that is not a UUID', { fromPaymentMethodId: 'yape' }],
    ['a destination that is not a UUID', { toPaymentMethodId: 'yape' }],
    ['a date with time', { date: '2026-09-10T10:00:00Z' }],
    ['a blank description', { description: '  ' }],
    ['a description too long', { description: 'x'.repeat(TRANSACTION_DESCRIPTION_MAX_LENGTH + 1) }],
    ['a userId', { userId: '01999999-9999-7999-8999-000000000003' }],
    ['a source', { source: 'IMPORT' }],
    ['a category, which a transfer does not have', { categoryId: CHANGE.toPaymentMethodId }],
  ])('rejects %s', (_case, change) => {
    expect(accepts({ ...CHANGE, ...change })).toBe(false);
  });

  it.each(['date', 'fromPaymentMethodId', 'toPaymentMethodId', 'amount', 'description'])(
    'requires %s',
    (field) => {
      expect(
        accepts(Object.fromEntries(Object.entries(CHANGE).filter(([key]) => key !== field))),
      ).toBe(false);
    },
  );
});
