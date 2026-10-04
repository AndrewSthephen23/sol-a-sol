import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { type NotificationReading, readCaptureRequest } from './capture-request.js';

function notification(extra: Partial<NotificationReading> = {}): NotificationReading {
  return {
    kind: 'EXPENSE',
    amount: Money.of('25.90', 'PEN'),
    merchant: 'TAMBO',
    cardLast4: '4242',
    warnings: [],
    ...extra,
  };
}

const NOTHING = { amountText: null, merchant: null, card: null, notification: null };

describe('readCaptureRequest', () => {
  it('reads the fields the shortcut sends', () => {
    expect(
      readCaptureRequest({
        amountText: 'S/ 1,234.50',
        merchant: ' Tambo ',
        card: 'Visa BCP',
        notification: null,
      }),
    ).toEqual({
      type: 'VARIABLE_EXPENSE',
      amount: { value: '1234.50', currency: 'PEN' },
      merchant: 'Tambo',
      cardLast4: null,
      cardText: 'Visa BCP',
      warnings: [],
    });
  });

  it('reads what the notification understood', () => {
    expect(readCaptureRequest({ ...NOTHING, notification: notification() })).toEqual({
      type: 'VARIABLE_EXPENSE',
      amount: { value: '25.90', currency: 'PEN' },
      merchant: 'TAMBO',
      cardLast4: '4242',
      cardText: null,
      warnings: [],
    });
  });

  it('keeps an amount without a currency, to take it from the payment method', () => {
    expect(readCaptureRequest({ ...NOTHING, amountText: '25.90' }).amount).toEqual({
      value: '25.90',
      currency: null,
    });
  });

  it('reads a lone $ as dollars', () => {
    expect(readCaptureRequest({ ...NOTHING, amountText: '$ 20' }).amount).toEqual({
      value: '20.00',
      currency: 'USD',
    });
  });

  it('gives nothing, without warnings, when nothing came', () => {
    expect(readCaptureRequest(NOTHING)).toEqual({
      type: 'VARIABLE_EXPENSE',
      amount: null,
      merchant: null,
      cardLast4: null,
      cardText: null,
      warnings: [],
    });
  });

  it.each(['', '   '])('treats a blank amount (%j) as missing', (amountText) => {
    expect(readCaptureRequest({ ...NOTHING, amountText })).toMatchObject({
      amount: null,
      warnings: [],
    });
  });

  it.each([
    ['unreadable', 'veinte soles'],
    ['with more than 2 decimals', 'S/ 25.905'],
    ['zero', '0.00'],
    ['negative', 'S/ -5.00'],
    ['negative without a currency', '-5'],
  ])('warns about an amount that is %s and leaves it out', (_label, amountText) => {
    expect(readCaptureRequest({ ...NOTHING, amountText })).toMatchObject({
      amount: null,
      warnings: ['INVALID_AMOUNT'],
    });
  });

  describe('when the fields and the notification both come (decision 2)', () => {
    it('lets the text complete what the fields do not say', () => {
      expect(
        readCaptureRequest({
          amountText: null,
          merchant: null,
          card: null,
          notification: notification(),
        }),
      ).toMatchObject({ amount: { value: '25.90', currency: 'PEN' }, merchant: 'TAMBO' });
    });

    it('takes the currency from the text when the field has the same amount without one', () => {
      expect(
        readCaptureRequest({ ...NOTHING, amountText: '25.90', notification: notification() }),
      ).toMatchObject({ amount: { value: '25.90', currency: 'PEN' }, warnings: [] });
    });

    it('agrees when both say the same amount and currency', () => {
      expect(
        readCaptureRequest({ ...NOTHING, amountText: 'S/ 25.9', notification: notification() }),
      ).toMatchObject({ amount: { value: '25.90', currency: 'PEN' }, warnings: [] });
    });

    it.each([
      ['another amount', '30.00', { value: '30.00', currency: null }],
      ['the same amount in another currency', 'US$ 25.90', { value: '25.90', currency: 'USD' }],
    ])('keeps the field and warns when it says %s', (_label, amountText, amount) => {
      expect(
        readCaptureRequest({ ...NOTHING, amountText, notification: notification() }),
      ).toMatchObject({ amount, warnings: ['AMOUNT_MISMATCH'] });
    });

    it('falls back to the text when the field cannot be read, and says so', () => {
      expect(
        readCaptureRequest({ ...NOTHING, amountText: 'abc', notification: notification() }),
      ).toMatchObject({
        amount: { value: '25.90', currency: 'PEN' },
        warnings: ['INVALID_AMOUNT'],
      });
    });

    it('prefers the merchant of the field', () => {
      expect(
        readCaptureRequest({ ...NOTHING, merchant: 'Tambo Larco', notification: notification() })
          .merchant,
      ).toBe('Tambo Larco');
    });

    it('takes the merchant of the text when the field is blank', () => {
      expect(
        readCaptureRequest({ ...NOTHING, merchant: '  ', notification: notification() }).merchant,
      ).toBe('TAMBO');
    });

    it('keeps the warnings of the notification first', () => {
      expect(
        readCaptureRequest({
          ...NOTHING,
          amountText: '30.00',
          notification: notification({ warnings: ['CARD_NUMBER_MASKED'] }),
        }).warnings,
      ).toEqual(['CARD_NUMBER_MASKED', 'AMOUNT_MISMATCH']);
    });
  });

  describe('card', () => {
    it.each([
      ['4242', '4242'],
      ['Visa ****4242', '4242'],
      ['Visa ••••4242', '4242'],
    ])('takes the last 4 from %j', (card, last4) => {
      expect(readCaptureRequest({ ...NOTHING, card }).cardLast4).toBe(last4);
    });

    it.each([
      ['no group of 4 digits', 'Visa BCP'],
      ['a group that is not 4 digits long', 'Cuenta 12345'],
      ['two different groups', '1234 y 5678'],
    ])('takes no last 4 from a card with %s', (_label, card) => {
      expect(readCaptureRequest({ ...NOTHING, card }).cardLast4).toBeNull();
    });

    it('takes the same group written twice', () => {
      expect(readCaptureRequest({ ...NOTHING, card: '4242 (4242)' }).cardLast4).toBe('4242');
    });

    it('lets the last 4 of the field win over the text', () => {
      expect(
        readCaptureRequest({ ...NOTHING, card: '1111', notification: notification() }).cardLast4,
      ).toBe('1111');
    });

    it('takes the last 4 of the text when the field has none', () => {
      expect(
        readCaptureRequest({ ...NOTHING, card: 'Visa BCP', notification: notification() }),
      ).toMatchObject({ cardLast4: '4242', cardText: 'Visa BCP' });
    });

    it('treats a blank card as missing', () => {
      expect(readCaptureRequest({ ...NOTHING, card: ' ' }).cardText).toBeNull();
    });
  });

  it('reads a notification of money coming in as an income (decision 8)', () => {
    expect(
      readCaptureRequest({ ...NOTHING, notification: notification({ kind: 'INCOME' }) }).type,
    ).toBe('INCOME');
  });
});
