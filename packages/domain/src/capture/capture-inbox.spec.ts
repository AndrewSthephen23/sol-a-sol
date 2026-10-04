import { describe, expect, it } from 'vitest';

import { LocalDate } from '../time/local-date.js';
import { CaptureNotPendingError } from './capture-confirmation.js';
import {
  assertInInbox,
  CaptureNotDiscardedError,
  type CaptureFields,
  correctCapture,
  discardCapture,
  discardedPurgeCutoff,
  restoreCapture,
} from './capture-inbox.js';

const FIELDS: CaptureFields = {
  type: 'VARIABLE_EXPENSE',
  date: LocalDate.of(2026, 10, 3),
  amount: { value: '25.90', currency: 'PEN' },
  categoryId: 'viveres',
  paymentMethodId: 'visa',
  merchant: 'Tambo',
  description: null,
};

describe('assertInInbox', () => {
  it.each(['PENDING', 'DUPLICATE'] as const)('lets a %s capture be changed', (status) => {
    expect(() => {
      assertInInbox(status);
    }).not.toThrow();
  });

  it.each(['CONFIRMED', 'DISCARDED'] as const)('refuses a %s capture', (status) => {
    expect(() => {
      assertInInbox(status);
    }).toThrow(CaptureNotPendingError);
  });
});

describe('discardCapture (decision 11)', () => {
  const at = new Date('2026-10-04T15:00:00.000Z');

  it.each(['PENDING', 'DUPLICATE'] as const)('remembers that it was %s', (status) => {
    expect(discardCapture(status, at)).toEqual({
      status: 'DISCARDED',
      discardedAt: at,
      discardedFrom: status,
    });
  });

  it.each(['CONFIRMED', 'DISCARDED'] as const)('refuses a %s capture', (status) => {
    expect(() => discardCapture(status, at)).toThrow(CaptureNotPendingError);
  });
});

describe('restoreCapture (decided 2026-10-04)', () => {
  it.each(['PENDING', 'DUPLICATE'] as const)('takes it back to %s, as it was', (discardedFrom) => {
    expect(restoreCapture('DISCARDED', discardedFrom)).toEqual({
      status: discardedFrom,
      discardedAt: null,
      discardedFrom: null,
    });
  });

  it.each(['PENDING', 'DUPLICATE', 'CONFIRMED'] as const)(
    'refuses a %s capture, which is not discarded',
    (status) => {
      expect(() => restoreCapture(status, null)).toThrow(CaptureNotDiscardedError);
    },
  );

  it('takes a discarded capture of unknown origin back to pending', () => {
    expect(restoreCapture('DISCARDED', null).status).toBe('PENDING');
  });

  it('explains its error and gives its stable code', () => {
    const error = new CaptureNotDiscardedError();

    expect(error.code).toBe('CAPTURE_NOT_DISCARDED');
    expect(error.message).toBe('Only a discarded capture can be restored.');
  });
});

describe('discardedPurgeCutoff (decision 11)', () => {
  it('is 90 days before now', () => {
    expect(discardedPurgeCutoff(new Date('2026-10-04T09:00:00.000Z'))).toEqual(
      new Date('2026-07-06T09:00:00.000Z'),
    );
  });
});

describe('correctCapture (decision 10)', () => {
  it('changes only what comes', () => {
    expect(correctCapture(FIELDS, { description: ' Almuerzo ' })).toEqual({
      ...FIELDS,
      description: 'Almuerzo',
    });
  });

  it('changes everything at once', () => {
    expect(
      correctCapture(FIELDS, {
        type: 'INCOME',
        date: LocalDate.of(2026, 10, 1),
        amount: '30',
        currency: 'USD',
        categoryId: 'honorarios',
        paymentMethodId: null,
        merchant: 'Cliente',
        description: 'Pago',
      }),
    ).toEqual({
      type: 'INCOME',
      date: LocalDate.of(2026, 10, 1),
      amount: { value: '30.00', currency: 'USD' },
      categoryId: 'honorarios',
      paymentMethodId: null,
      merchant: 'Cliente',
      description: 'Pago',
    });
  });

  it('clears the category when the type changes without one (decided 2026-10-03)', () => {
    expect(correctCapture(FIELDS, { type: 'INCOME' }).categoryId).toBeNull();
  });

  it('keeps the category when the type stays the same', () => {
    expect(correctCapture(FIELDS, { type: 'VARIABLE_EXPENSE' }).categoryId).toBe('viveres');
  });

  it('writes an amount into a capture that had none, keeping it without a currency', () => {
    expect(correctCapture({ ...FIELDS, amount: null }, { amount: '12.5' }).amount).toEqual({
      value: '12.50',
      currency: null,
    });
  });

  it('keeps the currency it had when only the amount changes', () => {
    expect(correctCapture(FIELDS, { amount: '99.99' }).amount).toEqual({
      value: '99.99',
      currency: 'PEN',
    });
  });

  it('chooses the currency of an amount that had none', () => {
    expect(
      correctCapture({ ...FIELDS, amount: { value: '25.90', currency: null } }, { currency: 'USD' })
        .amount,
    ).toEqual({ value: '25.90', currency: 'USD' });
  });

  it('clears the amount', () => {
    expect(correctCapture(FIELDS, { amount: null }).amount).toBeNull();
  });

  it('leaves the currency out with no amount to hold it', () => {
    expect(correctCapture({ ...FIELDS, amount: null }, { currency: 'USD' }).amount).toBeNull();
  });

  it('clears the merchant and the description', () => {
    expect(
      correctCapture({ ...FIELDS, description: 'Pago' }, { merchant: null, description: null }),
    ).toMatchObject({ merchant: null, description: null });
  });

  it.each(['  ', ''])('turns a blank merchant or description (%j) into none', (text) => {
    expect(correctCapture(FIELDS, { merchant: text, description: text })).toMatchObject({
      merchant: null,
      description: null,
    });
  });

  it.each([
    ['zero', '0'],
    ['negative', '-1'],
    ['with more than 2 decimals', '1.005'],
  ])('refuses an amount that is %s', (_label, amount) => {
    expect(() => correctCapture(FIELDS, { amount })).toThrow();
  });
});
