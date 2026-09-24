import { describe, expect, it } from 'vitest';

import {
  createPaymentMethodRequestSchema,
  INSTITUTION_MAX_LENGTH,
  LAST4_INPUT_MAX_LENGTH,
  listPaymentMethodsQuerySchema,
  PAYMENT_METHOD_ALIAS_MAX_LENGTH,
  updatePaymentMethodRequestSchema,
} from './payment-methods.js';

const CARD = {
  kind: 'CREDIT_CARD',
  alias: 'Visa BCP',
  institution: 'BCP',
  last4: '4242',
  currency: 'PEN',
};

describe('create payment method request', () => {
  it('accepts a kind, an alias, a bank, the last 4 digits and a currency', () => {
    expect(createPaymentMethodRequestSchema.parse(CARD)).toEqual(CARD);
  });

  it('accepts cash with only its kind and alias', () => {
    expect(createPaymentMethodRequestSchema.parse({ kind: 'CASH', alias: 'Efectivo' })).toEqual({
      kind: 'CASH',
      alias: 'Efectivo',
    });
  });

  it('accepts null for the optional fields', () => {
    const body = { ...CARD, institution: null, last4: null, currency: null };

    expect(createPaymentMethodRequestSchema.parse(body)).toEqual(body);
  });

  it('trims the alias and the institution', () => {
    const parsed = createPaymentMethodRequestSchema.parse({
      ...CARD,
      alias: '  Visa BCP ',
      institution: ' BCP ',
    });

    expect(parsed).toMatchObject({ alias: 'Visa BCP', institution: 'BCP' });
  });

  it.each(['', '   '])('rejects a blank alias (%j)', (alias) => {
    expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, alias }).success).toBe(false);
  });

  it('rejects a blank institution: without a bank it is null', () => {
    expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, institution: ' ' }).success).toBe(
      false,
    );
  });

  it.each([
    ['alias', PAYMENT_METHOD_ALIAS_MAX_LENGTH],
    ['institution', INSTITUTION_MAX_LENGTH],
    ['last4', LAST4_INPUT_MAX_LENGTH],
  ])('rejects a %s past the defensive limit', (field, max) => {
    const body = { ...CARD, [field]: '1'.repeat(max + 1) };

    expect(createPaymentMethodRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each(['GIFT_CARD', 'credit_card', undefined])('rejects %j as the kind', (kind) => {
    expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, kind }).success).toBe(false);
  });

  it.each(['EUR', 'S/', 'pen'])('rejects %j as the currency', (currency) => {
    expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, currency }).success).toBe(false);
  });

  // Que sean cuatro dígitos es una regla del dominio (INVALID_LAST4): aquí solo se mira la forma.
  it('leaves the format of the last 4 digits to the domain', () => {
    expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, last4: '12' }).success).toBe(true);
  });

  // Nada de datos sensibles de tarjeta, ni del dueño: el userId sale del token, nunca del cuerpo.
  it.each(['cardNumber', 'cvv', 'expiresAt', 'userId'])(
    'rejects an unknown field (%s)',
    (field) => {
      expect(createPaymentMethodRequestSchema.safeParse({ ...CARD, [field]: 'x' }).success).toBe(
        false,
      );
    },
  );
});

describe('update payment method request', () => {
  it('accepts any subset of the editable fields', () => {
    expect(updatePaymentMethodRequestSchema.parse({ alias: 'Visa Signature' })).toEqual({
      alias: 'Visa Signature',
    });
    expect(updatePaymentMethodRequestSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updatePaymentMethodRequestSchema.parse({ currency: null, last4: '0931' })).toEqual({
      currency: null,
      last4: '0931',
    });
  });

  it('rejects an empty change', () => {
    expect(updatePaymentMethodRequestSchema.safeParse({}).success).toBe(false);
  });

  // El tipo no se cambia: en H5 una tarjeta tendrá datos propios colgados de ella.
  it('rejects a change of kind', () => {
    expect(updatePaymentMethodRequestSchema.safeParse({ kind: 'CASH' }).success).toBe(false);
  });

  it('rejects an archived flag that is not a boolean', () => {
    expect(updatePaymentMethodRequestSchema.safeParse({ archived: 'true' }).success).toBe(false);
  });

  it('does not allow clearing the alias', () => {
    expect(updatePaymentMethodRequestSchema.safeParse({ alias: null }).success).toBe(false);
  });
});

describe('list payment methods query', () => {
  it('leaves the archived ones out by default', () => {
    expect(listPaymentMethodsQuerySchema.parse({})).toEqual({ includeArchived: false });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads includeArchived=%s', (value, expected) => {
    expect(listPaymentMethodsQuerySchema.parse({ includeArchived: value })).toEqual({
      includeArchived: expected,
    });
  });

  it.each(['1', 'yes', 'TRUE'])('rejects includeArchived=%s instead of guessing', (value) => {
    expect(listPaymentMethodsQuerySchema.safeParse({ includeArchived: value }).success).toBe(false);
  });
});
