import { describe, expect, it } from 'vitest';

import type { Category, PaymentMethod } from '@/features/transactions/queries';

import {
  type Capture,
  captureErrorMessage,
  checkCorrection,
  correctionValuesFor,
  missingLabel,
  missingToConfirm,
  pendingCapturesText,
  pendingCountLabel,
  warningLabel,
} from './capture-model';

const CAPTURE: Capture = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'ANDROID_AUTOMATION',
  status: 'PENDING',
  parsed: true,
  type: 'VARIABLE_EXPENSE',
  amount: '25.90',
  currency: 'PEN',
  merchant: 'Tambo',
  cardLast4: '4242',
  date: '2026-10-03',
  occurredAt: '2026-10-03T16:30:00.000Z',
  categoryId: 'viveres',
  paymentMethodId: null,
  description: null,
  warnings: [],
  raw: { rawText: 'Compra en TAMBO' },
  discardedAt: null,
  transactionId: null,
};

const CATEGORIES = [
  { id: 'viveres', name: 'Víveres', type: 'VARIABLE_EXPENSE', children: [] },
  { id: 'honorarios', name: 'Honorarios', type: 'INCOME', children: [] },
] as unknown as Category[];

const METHODS = [
  { id: 'visa', alias: 'Visa', last4: '4242', currency: 'USD' },
  { id: 'bimoneda', alias: 'Mastercard', last4: null, currency: null },
] as unknown as PaymentMethod[];

const CONTEXT = { categories: CATEGORIES, paymentMethods: METHODS, today: '2026-10-04' };

describe('missingToConfirm', () => {
  it('finds nothing missing in a complete capture', () => {
    expect(missingToConfirm(CAPTURE)).toEqual([]);
  });

  it('lets the merchant stand in for the description', () => {
    expect(missingToConfirm({ ...CAPTURE, description: null, merchant: 'Tambo' })).toEqual([]);
  });

  it.each([
    ['the amount', { amount: null, currency: null }, ['el monto']],
    ['the currency', { currency: null }, ['la moneda']],
    ['the category', { categoryId: null }, ['la categoría']],
    ['a description', { merchant: null }, ['la descripción']],
  ])('says it lacks %s', (_label, extra, missing) => {
    expect(missingToConfirm({ ...CAPTURE, ...extra })).toEqual(missing);
  });
});

describe('missingLabel', () => {
  it.each([
    [[], ''],
    [['la categoría'], 'Falta la categoría.'],
    [['el monto', 'la categoría'], 'Faltan el monto y la categoría.'],
    [
      ['el monto', 'la categoría', 'la descripción'],
      'Faltan el monto, la categoría y la descripción.',
    ],
  ])('puts %j in words', (missing, label) => {
    expect(missingLabel(missing)).toBe(label);
  });
});

describe('warningLabel and captureErrorMessage', () => {
  it('puts the warnings in words, and an unknown one in general words', () => {
    expect(warningLabel('AMOUNT_NOT_FOUND')).toBe('No se encontró el monto.');
    expect(warningLabel('ALGO_NUEVO')).toBe('Hay algo que revisar.');
  });

  it('translates the errors of the inbox and those of the transaction', () => {
    expect(captureErrorMessage('CAPTURE_NOT_PENDING')).toBe(
      'Ya se confirmó o se descartó, quizá desde otra pestaña.',
    );
    expect(captureErrorMessage('CATEGORY_ARCHIVED')).toBe('Esa categoría está archivada.');
    expect(captureErrorMessage(null)).toBe('Algo salió mal. Inténtalo de nuevo en un momento.');
  });
});

describe('checkCorrection', () => {
  it('builds the patch, with the type of the chosen category', () => {
    const values = {
      ...correctionValuesFor(CAPTURE),
      categoryId: 'honorarios',
      description: ' Pago ',
    };

    expect(checkCorrection(values, CONTEXT)).toEqual({
      body: {
        amount: '25.90',
        currency: 'PEN',
        date: '2026-10-03',
        categoryId: 'honorarios',
        type: 'INCOME',
        paymentMethodId: null,
        merchant: 'Tambo',
        description: 'Pago',
      },
    });
  });

  it('takes the currency of a method that has only one', () => {
    const values = { ...correctionValuesFor(CAPTURE), currency: null, paymentMethodId: 'visa' };

    expect(checkCorrection(values, CONTEXT)).toMatchObject({ body: { currency: 'USD' } });
  });

  it('keeps no amount and no category when they are left empty', () => {
    const values = { ...correctionValuesFor(CAPTURE), amount: '', categoryId: '', merchant: ' ' };

    expect(checkCorrection(values, CONTEXT)).toMatchObject({
      body: { amount: null, categoryId: null, merchant: null },
    });
  });

  it('does not send a type without a category', () => {
    const values = { ...correctionValuesFor(CAPTURE), categoryId: '' };
    const checked = checkCorrection(values, CONTEXT);

    expect('body' in checked && 'type' in checked.body).toBe(false);
  });

  it.each([
    ['an amount with 3 decimals', { amount: '25.905' }, 'amount'],
    ['a zero amount', { amount: '0' }, 'amount'],
    ['no date', { date: '' }, 'date'],
    ['a future date', { date: '2026-10-05' }, 'date'],
  ])('refuses %s, next to its field', (_label, extra, field) => {
    const checked = checkCorrection({ ...correctionValuesFor(CAPTURE), ...extra }, CONTEXT);

    expect('errors' in checked ? Object.keys(checked.errors) : []).toEqual([field]);
  });
});

describe('pendingCountLabel (decided 2026-10-04)', () => {
  it.each([
    [{ count: 3, more: false }, '3'],
    [{ count: 99, more: false }, '99'],
    [{ count: 100, more: false }, '99+'],
    [{ count: 100, more: true }, '99+'],
  ])('counts %j as %s', (pending, label) => {
    expect(pendingCountLabel(pending)).toBe(label);
  });

  it('puts the count in words', () => {
    expect(pendingCapturesText({ count: 1, more: false })).toBe('1 captura');
    expect(pendingCapturesText({ count: 4, more: false })).toBe('4 capturas');
    expect(pendingCapturesText({ count: 100, more: true })).toBe('99+ capturas');
  });
});
