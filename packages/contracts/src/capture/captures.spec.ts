import { describe, expect, it } from 'vitest';

import {
  CAPTURE_RAW_TEXT_MAX_LENGTH,
  captureParamsSchema,
  CAPTURES_DEFAULT_LIMIT,
  CAPTURES_MAX_LIMIT,
  createCaptureRequestSchema,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  idempotencyKeySchema,
  listCapturesQuerySchema,
  updateCaptureRequestSchema,
} from './captures.js';

const SHORTCUT = {
  source: 'IOS_SHORTCUT',
  occurredAt: '2026-10-03T21:30:00-05:00',
  amountText: 'S/ 25.90',
  merchant: 'TAMBO',
  card: 'Visa BCP',
};

describe('createCaptureRequestSchema', () => {
  it('accepts what the shortcut sends', () => {
    expect(createCaptureRequestSchema.parse(SHORTCUT)).toEqual(SHORTCUT);
  });

  it('accepts what the automation sends: only the text of the notification', () => {
    const body = {
      source: 'ANDROID_AUTOMATION',
      occurredAt: '2026-10-04T02:30:00Z',
      rawText: 'Yapeaste S/ 25.90',
    };

    expect(createCaptureRequestSchema.parse(body)).toEqual(body);
  });

  it('needs only the source and the instant', () => {
    const body = { source: 'IOS_SHORTCUT', occurredAt: '2026-10-03T21:30:00-05:00' };

    expect(createCaptureRequestSchema.safeParse(body).success).toBe(true);
  });

  it('accepts empty or null fields, as a shortcut sends an empty variable', () => {
    const body = { ...SHORTCUT, amountText: '', merchant: null, card: null, rawText: null };

    expect(createCaptureRequestSchema.safeParse(body).success).toBe(true);
  });

  it('leaves understanding the amount to the domain: any text goes', () => {
    expect(
      createCaptureRequestSchema.safeParse({ ...SHORTCUT, amountText: 'veinte soles' }).success,
    ).toBe(true);
  });

  it.each([
    ['no source', { occurredAt: SHORTCUT.occurredAt }],
    ['no instant', { source: 'IOS_SHORTCUT' }],
    ['an unknown source', { ...SHORTCUT, source: 'MANUAL' }],
    ['an instant without a time zone', { ...SHORTCUT, occurredAt: '2026-10-03T21:30:00' }],
    ['a date without a time', { ...SHORTCUT, occurredAt: '2026-10-03' }],
    ['a userId in the body', { ...SHORTCUT, userId: '01999999-9999-7999-8999-000000000001' }],
    ['a text too long', { ...SHORTCUT, rawText: 'x'.repeat(CAPTURE_RAW_TEXT_MAX_LENGTH + 1) }],
    ['a merchant too long', { ...SHORTCUT, merchant: 'x'.repeat(121) }],
    ['a card too long', { ...SHORTCUT, card: 'x'.repeat(61) }],
    ['an amount too long', { ...SHORTCUT, amountText: '1'.repeat(41) }],
    ['a number as the amount', { ...SHORTCUT, amountText: 25.9 }],
  ])('rejects %s', (_label, body) => {
    expect(createCaptureRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('idempotencyKeySchema', () => {
  it('accepts a key and trims it', () => {
    expect(idempotencyKeySchema.parse('  4f1c-reintento  ')).toBe('4f1c-reintento');
  });

  it('treats a missing or blank header as no key', () => {
    expect(idempotencyKeySchema.parse(undefined)).toBeUndefined();
    expect(idempotencyKeySchema.parse('   ')).toBeUndefined();
  });

  it.each([
    ['too long', 'x'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)],
    ['with control characters', 'clave\nmala'],
    ['repeated', ['a', 'b']],
  ])('rejects a key %s', (_label, key) => {
    expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('listCapturesQuerySchema', () => {
  it('shows the inbox by default, 50 at a time', () => {
    expect(listCapturesQuerySchema.parse({})).toEqual({
      status: 'inbox',
      limit: CAPTURES_DEFAULT_LIMIT,
    });
  });

  it('shows the discarded ones and trims a big limit', () => {
    expect(listCapturesQuerySchema.parse({ status: 'discarded', limit: '500' })).toEqual({
      status: 'discarded',
      limit: CAPTURES_MAX_LIMIT,
    });
  });

  it.each([
    ['the confirmed ones, which are transactions already', { status: 'confirmed' }],
    ['a limit of zero', { limit: '0' }],
    ['a limit that is not a number', { limit: 'diez' }],
    ['an empty cursor', { cursor: '' }],
  ])('rejects %s', (_label, query) => {
    expect(listCapturesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('updateCaptureRequestSchema', () => {
  it('accepts every field, and null to clear', () => {
    const body = {
      type: 'INCOME',
      date: '2026-10-01',
      amount: '30.00',
      currency: null,
      categoryId: null,
      paymentMethodId: '01999999-9999-7999-8999-000000000001',
      merchant: null,
      description: 'Pago',
    };

    expect(updateCaptureRequestSchema.parse(body)).toEqual(body);
  });

  it('leaves the rules to the domain: a zero amount has the right shape', () => {
    expect(updateCaptureRequestSchema.safeParse({ amount: '0.00' }).success).toBe(true);
  });

  it.each([
    ['nothing to change', {}],
    ['a status, which changes by confirming or discarding', { status: 'CONFIRMED' }],
    ['an unknown type', { type: 'GASTO' }],
    ['a date with a time', { date: '2026-10-01T10:00:00Z' }],
    ['a number as the amount', { amount: 30 }],
    ['a category that is not a UUID', { categoryId: 'viveres' }],
    ['a merchant too long', { merchant: 'x'.repeat(121) }],
    ['a userId', { userId: '01999999-9999-7999-8999-000000000001' }],
  ])('rejects %s', (_label, body) => {
    expect(updateCaptureRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('captureParamsSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(
      captureParamsSchema.safeParse({ id: '01999999-9999-7999-8999-000000000001' }).success,
    ).toBe(true);
    expect(captureParamsSchema.safeParse({ id: '1' }).success).toBe(false);
  });
});
