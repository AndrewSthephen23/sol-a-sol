import { describe, expect, it } from 'vitest';

import {
  createCreditCardRequestSchema,
  creditCardParamsSchema,
  updateCreditCardRequestSchema,
} from './credit-cards.js';

const METHOD = '01999999-9999-7999-8999-000000000001';
const CARD = {
  paymentMethodId: METHOD,
  creditLimit: { amount: '5000.00', currency: 'PEN' },
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
};

describe('createCreditCardRequestSchema', () => {
  it('accepts a card without an opening balance', () => {
    expect(createCreditCardRequestSchema.parse(CARD)).toEqual(CARD);
  });

  it('accepts a fixed payment day and an opening balance per currency', () => {
    const body = {
      ...CARD,
      paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
      openingBalance: {
        date: '2026-09-01',
        amounts: [
          { amount: '1200.50', currency: 'PEN' },
          { amount: '80.00', currency: 'USD' },
        ],
      },
    };

    expect(createCreditCardRequestSchema.parse(body)).toEqual(body);
  });

  it('accepts an explicit null opening balance', () => {
    expect(createCreditCardRequestSchema.parse({ ...CARD, openingBalance: null })).toMatchObject({
      openingBalance: null,
    });
  });

  it('leaves the ranges to the domain, which says which rule broke', () => {
    const body = {
      ...CARD,
      creditLimit: { amount: '-1.00', currency: 'PEN' },
      statementDay: 40,
      paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 90 },
    };

    expect(createCreditCardRequestSchema.safeParse(body).success).toBe(true);
  });

  it.each([
    ['a userId in the body', { ...CARD, userId: METHOD }],
    ['a card number', { ...CARD, number: '4111111111111111' }],
    ['a CVV', { ...CARD, cvv: '123' }],
    ['a credit limit as a number', { ...CARD, creditLimit: { amount: 5000, currency: 'PEN' } }],
    ['a credit limit without currency', { ...CARD, creditLimit: { amount: '5000.00' } }],
    ['a currency it does not know', { ...CARD, creditLimit: { amount: '1.00', currency: 'EUR' } }],
    ['a payment method that is not a UUID', { ...CARD, paymentMethodId: 'visa' }],
    ['a statement day with decimals', { ...CARD, statementDay: 20.5 }],
    ['a statement day as text', { ...CARD, statementDay: '20' }],
    ['a rule it does not know', { ...CARD, paymentDueRule: { kind: 'NEXT_FRIDAY' } }],
    [
      'a rule with the field of the other one',
      { ...CARD, paymentDueRule: { kind: 'DAY_OF_MONTH', days: 5 } },
    ],
    [
      'a rule with both fields',
      { ...CARD, paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5, days: 25 } },
    ],
    [
      'an opening balance without amounts',
      { ...CARD, openingBalance: { date: '2026-09-01', amounts: [] } },
    ],
    [
      'an opening balance with three amounts',
      {
        ...CARD,
        openingBalance: {
          date: '2026-09-01',
          amounts: [
            { amount: '1.00', currency: 'PEN' },
            { amount: '1.00', currency: 'USD' },
            { amount: '1.00', currency: 'PEN' },
          ],
        },
      },
    ],
    [
      'an opening balance with a Peruvian date',
      {
        ...CARD,
        openingBalance: { date: '01/09/2026', amounts: [{ amount: '1.00', currency: 'PEN' }] },
      },
    ],
    ['no payment method', { ...CARD, paymentMethodId: undefined }],
  ])('rejects %s', (_case, body) => {
    expect(createCreditCardRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateCreditCardRequestSchema', () => {
  it('accepts a single change', () => {
    expect(updateCreditCardRequestSchema.parse({ statementDay: 5 })).toEqual({ statementDay: 5 });
  });

  it('accepts removing the opening balance', () => {
    expect(updateCreditCardRequestSchema.parse({ openingBalance: null })).toEqual({
      openingBalance: null,
    });
  });

  it.each([
    ['nothing to change', {}],
    ['moving the card to another payment method', { paymentMethodId: METHOD }],
    ['a userId', { userId: METHOD }],
  ])('rejects %s', (_case, body) => {
    expect(updateCreditCardRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('creditCardParamsSchema', () => {
  it('accepts a UUID', () => {
    expect(creditCardParamsSchema.parse({ id: METHOD })).toEqual({ id: METHOD });
  });

  it('rejects anything else', () => {
    expect(creditCardParamsSchema.safeParse({ id: 'visa' }).success).toBe(false);
  });
});
