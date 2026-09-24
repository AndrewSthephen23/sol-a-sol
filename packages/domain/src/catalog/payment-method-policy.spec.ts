import { describe, expect, it } from 'vitest';

import {
  assertValidPaymentMethod,
  InstitutionNotAllowedError,
  InvalidLast4Error,
  Last4NotAllowedError,
  Last4RequiredError,
  PAYMENT_METHOD_KINDS,
  type PaymentMethodDetails,
  PaymentMethodCurrencyRequiredError,
} from './payment-method-policy.js';

const CARD: PaymentMethodDetails = {
  kind: 'CREDIT_CARD',
  institution: 'BCP',
  last4: '4242',
  currency: 'PEN',
};
const ACCOUNT: PaymentMethodDetails = {
  kind: 'ACCOUNT',
  institution: 'Interbank',
  last4: null,
  currency: 'USD',
};
const WALLET: PaymentMethodDetails = {
  kind: 'WALLET',
  institution: 'BCP',
  last4: null,
  currency: 'PEN',
};
const CASH: PaymentMethodDetails = { kind: 'CASH', institution: null, last4: null, currency: null };

describe('payment method kinds', () => {
  it('are the four of the glossary, in English', () => {
    expect(PAYMENT_METHOD_KINDS).toEqual(['ACCOUNT', 'WALLET', 'CREDIT_CARD', 'CASH']);
  });
});

describe('assertValidPaymentMethod', () => {
  // Fábricas y no objetos: se arman al correr la prueba, no al recolectarla. Si uno lanzara al
  // recolectar, se caería el archivo entero y los mutantes parecerían sobrevivir.
  it.each([
    ['a credit card with its last 4 digits', (): PaymentMethodDetails => CARD],
    ['a dual-currency credit card, without currency', () => ({ ...CARD, currency: null })],
    ['an account with its last 4 digits', () => ({ ...ACCOUNT, last4: '0931' })],
    ['an account without them', () => ACCOUNT],
    ['a wallet', () => WALLET],
    ['cash in soles', () => ({ ...CASH, currency: 'PEN' as const })],
    ['cash in any currency', () => CASH],
  ])('accepts %s', (_case, details) => {
    expect(() => {
      assertValidPaymentMethod(details());
    }).not.toThrow();
  });

  describe('last 4 digits', () => {
    // Recortar un número largo en silencio sería aceptar que alguien mandó el número completo.
    it.each(['424', '42424', '4242424242', '42a4', '42 4', ' 4242', '４２４２', ''])(
      'rejects %j instead of trimming or fixing it',
      (last4) => {
        expect(() => {
          assertValidPaymentMethod({ ...CARD, last4 });
        }).toThrow(InvalidLast4Error);
      },
    );

    it('checks the format before the rules of the kind', () => {
      expect(() => {
        assertValidPaymentMethod({ ...WALLET, last4: '12' });
      }).toThrow(InvalidLast4Error);
    });

    it('are required on a credit card: its notifications name it by them', () => {
      expect(() => {
        assertValidPaymentMethod({ ...CARD, last4: null });
      }).toThrow(Last4RequiredError);
    });

    it.each([
      ['a wallet', 'WALLET'],
      ['cash', 'CASH'],
    ] as const)('are not allowed on %s', (_case, kind) => {
      expect(() => {
        assertValidPaymentMethod({ kind, institution: null, last4: '4242', currency: 'PEN' });
      }).toThrow(Last4NotAllowedError);
    });
  });

  describe('currency', () => {
    it.each([
      ['an account', 'ACCOUNT'],
      ['a wallet', 'WALLET'],
    ] as const)('is required on %s: it holds a single currency', (_case, kind) => {
      expect(() => {
        assertValidPaymentMethod({ kind, institution: 'BCP', last4: null, currency: null });
      }).toThrow(PaymentMethodCurrencyRequiredError);
    });
  });

  describe('institution', () => {
    it('is not allowed on cash: cash has no bank', () => {
      expect(() => {
        assertValidPaymentMethod({ ...CASH, institution: 'BCP' });
      }).toThrow(InstitutionNotAllowedError);
    });
  });

  describe('errors', () => {
    it.each([
      ['InvalidLast4Error', 'INVALID_LAST4', /exactly 4 digits/],
      ['Last4RequiredError', 'LAST4_REQUIRED', /credit card needs/],
      ['Last4NotAllowedError', 'LAST4_NOT_ALLOWED', /WALLET does not/],
      ['PaymentMethodCurrencyRequiredError', 'PAYMENT_METHOD_CURRENCY_REQUIRED', /ACCOUNT needs/],
      ['InstitutionNotAllowedError', 'INSTITUTION_NOT_ALLOWED', /Cash has no/],
    ])('%s has a stable code and says which rule broke', (name, code, message) => {
      const errors: Record<string, () => Error & { code: string }> = {
        InvalidLast4Error: () => new InvalidLast4Error(),
        Last4RequiredError: () => new Last4RequiredError(),
        Last4NotAllowedError: () => new Last4NotAllowedError('WALLET'),
        PaymentMethodCurrencyRequiredError: () => new PaymentMethodCurrencyRequiredError('ACCOUNT'),
        InstitutionNotAllowedError: () => new InstitutionNotAllowedError(),
      };

      const error = errors[name]?.();

      expect(error?.code).toBe(code);
      expect(error?.message).toMatch(message);
      expect(error?.name).toBe(name);
    });
  });
});
