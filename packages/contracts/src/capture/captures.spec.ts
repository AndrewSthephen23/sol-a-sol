import { describe, expect, it } from 'vitest';

import {
  CAPTURE_RAW_TEXT_MAX_LENGTH,
  createCaptureRequestSchema,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  idempotencyKeySchema,
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
