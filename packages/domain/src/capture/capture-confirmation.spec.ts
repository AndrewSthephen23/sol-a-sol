import { describe, expect, it } from 'vitest';

import { LocalDate } from '../time/local-date.js';
import {
  FutureTransactionDateError,
  NonPositiveTransactionAmountError,
} from '../transactions/transaction-policy.js';
import {
  CaptureAmountMissingError,
  CaptureCategoryMissingError,
  CaptureCurrencyMissingError,
  CaptureDescriptionMissingError,
  CaptureNotPendingError,
  type CaptureToConfirm,
  transactionFromCapture,
} from './capture-confirmation.js';

const TODAY = LocalDate.of(2026, 10, 3);

function complete(extra: Partial<CaptureToConfirm> = {}): CaptureToConfirm {
  return {
    status: 'PENDING',
    source: 'ANDROID_AUTOMATION',
    type: 'VARIABLE_EXPENSE',
    date: LocalDate.of(2026, 10, 2),
    amount: { value: '25.90', currency: 'PEN' },
    categoryId: 'viveres',
    paymentMethodId: 'visa',
    merchant: 'Tambo',
    description: 'Almuerzo',
    ...extra,
  };
}

describe('transactionFromCapture', () => {
  it('turns a complete capture into its transaction', () => {
    const transaction = transactionFromCapture(complete(), TODAY);

    expect({ ...transaction, amount: transaction.amount.toFixed() }).toEqual({
      type: 'VARIABLE_EXPENSE',
      date: LocalDate.of(2026, 10, 2),
      amount: '25.90',
      categoryId: 'viveres',
      paymentMethodId: 'visa',
      merchant: 'Tambo',
      description: 'Almuerzo',
      source: 'ANDROID_AUTOMATION',
    });
    expect(transaction.amount.currency).toBe('PEN');
  });

  it('confirms a capture marked as a duplicate (decision 6)', () => {
    expect(transactionFromCapture(complete({ status: 'DUPLICATE' }), TODAY).source).toBe(
      'ANDROID_AUTOMATION',
    );
  });

  it('confirms a capture of today', () => {
    expect(transactionFromCapture(complete({ date: TODAY }), TODAY).date).toEqual(TODAY);
  });

  it('uses the merchant when there is no description (decided 2026-10-04)', () => {
    expect(transactionFromCapture(complete({ description: '  ' }), TODAY).description).toBe(
      'Tambo',
    );
    expect(transactionFromCapture(complete({ description: null }), TODAY).description).toBe(
      'Tambo',
    );
  });

  it('trims the description', () => {
    expect(transactionFromCapture(complete({ description: ' Almuerzo ' }), TODAY).description).toBe(
      'Almuerzo',
    );
  });

  it('keeps a capture without a payment method or merchant', () => {
    expect(
      transactionFromCapture(complete({ paymentMethodId: null, merchant: null }), TODAY),
    ).toMatchObject({ paymentMethodId: null, merchant: null });
  });

  it.each([
    ['confirmed', 'CONFIRMED'],
    ['discarded', 'DISCARDED'],
  ] as const)('refuses a %s capture', (_label, status) => {
    expect(() => transactionFromCapture(complete({ status }), TODAY)).toThrow(
      CaptureNotPendingError,
    );
  });

  it('refuses a capture without an amount', () => {
    expect(() => transactionFromCapture(complete({ amount: null }), TODAY)).toThrow(
      CaptureAmountMissingError,
    );
  });

  it('refuses a capture without a currency (decision 3)', () => {
    expect(() =>
      transactionFromCapture(complete({ amount: { value: '25.90', currency: null } }), TODAY),
    ).toThrow(CaptureCurrencyMissingError);
  });

  it('refuses a capture without a category', () => {
    expect(() => transactionFromCapture(complete({ categoryId: null }), TODAY)).toThrow(
      CaptureCategoryMissingError,
    );
  });

  it('refuses a capture with neither description nor merchant', () => {
    expect(() =>
      transactionFromCapture(complete({ description: null, merchant: ' ' }), TODAY),
    ).toThrow(CaptureDescriptionMissingError);
  });

  it('refuses an amount corrected to zero, like any transaction', () => {
    expect(() =>
      transactionFromCapture(complete({ amount: { value: '0.00', currency: 'PEN' } }), TODAY),
    ).toThrow(NonPositiveTransactionAmountError);
  });

  it('refuses a future date, like any transaction', () => {
    expect(() =>
      transactionFromCapture(complete({ date: LocalDate.of(2026, 10, 4) }), TODAY),
    ).toThrow(FutureTransactionDateError);
  });

  it('explains each error in English, for whoever debugs', () => {
    expect(
      [
        new CaptureNotPendingError(),
        new CaptureAmountMissingError(),
        new CaptureCurrencyMissingError(),
        new CaptureCategoryMissingError(),
        new CaptureDescriptionMissingError(),
      ].map((error) => error.message),
    ).toEqual([
      'The capture was already confirmed or discarded.',
      'The capture has no amount: write it before confirming.',
      'The capture has no currency: choose it before confirming.',
      'The capture has no category: choose it before confirming.',
      'The capture has neither a description nor a merchant: write one before confirming.',
    ]);
  });

  it('gives each error its stable code', () => {
    expect(
      [
        new CaptureNotPendingError(),
        new CaptureAmountMissingError(),
        new CaptureCurrencyMissingError(),
        new CaptureCategoryMissingError(),
        new CaptureDescriptionMissingError(),
      ].map((error) => error.code),
    ).toEqual([
      'CAPTURE_NOT_PENDING',
      'CAPTURE_AMOUNT_MISSING',
      'CAPTURE_CURRENCY_MISSING',
      'CAPTURE_CATEGORY_MISSING',
      'CAPTURE_DESCRIPTION_MISSING',
    ]);
  });
});
