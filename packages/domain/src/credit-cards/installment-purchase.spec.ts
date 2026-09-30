import { describe, expect, it } from 'vitest';

import { CurrencyMismatchError, Money } from '../money/money.js';
import { InstallmentTotalBelowPriceError } from './installment-plan.js';
import {
  assertInstallablePurchase,
  InstallmentPurchaseNotAChargeError,
  InstallmentPurchaseNotOnCardError,
  installmentPlanState,
  installmentPlanTotal,
  type PlannedPurchase,
} from './installment-purchase.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const CARD = 'method-card';
const PURCHASE: PlannedPurchase = {
  type: 'VARIABLE_EXPENSE',
  amount: pen('1000.00'),
  paymentMethodId: CARD,
};

describe('installmentPlanState', () => {
  it.each(['FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'DEBT', 'SAVING', 'INVESTMENT'] as const)(
    'is active for a %s with the card',
    (type) => {
      expect(installmentPlanState({ ...PURCHASE, type }, CARD, null)).toBe('ACTIVE');
    },
  );

  it('is active with a bank total equal to or above the price', () => {
    expect(installmentPlanState(PURCHASE, CARD, pen('1000.00'))).toBe('ACTIVE');
    expect(installmentPlanState(PURCHASE, CARD, pen('1086.40'))).toBe('ACTIVE');
  });

  it('is ignored while the purchase is deleted', () => {
    expect(installmentPlanState(null, CARD, null)).toBe('PURCHASE_DELETED');
  });

  it.each([
    ['another card', 'method-other'],
    ['no payment method', null],
  ])('is not valid once the purchase moves to %s', (_case, paymentMethodId) => {
    expect(installmentPlanState({ ...PURCHASE, paymentMethodId }, CARD, null)).toBe(
      'PURCHASE_NOT_ON_CARD',
    );
  });

  it('is not valid once the purchase becomes an income', () => {
    expect(installmentPlanState({ ...PURCHASE, type: 'INCOME' }, CARD, null)).toBe(
      'PURCHASE_NOT_A_CHARGE',
    );
  });

  it('is not valid once the purchase goes above the bank total', () => {
    expect(
      installmentPlanState({ ...PURCHASE, amount: pen('1100.00') }, CARD, pen('1086.40')),
    ).toBe('TOTAL_BELOW_PRICE');
  });
});

describe('installmentPlanTotal', () => {
  it('is the amount of the purchase today without interest', () => {
    expect(installmentPlanTotal(PURCHASE, null).toFixed()).toBe('1000.00');
  });

  it('is the bank total with interest', () => {
    expect(installmentPlanTotal(PURCHASE, pen('1086.40')).toFixed()).toBe('1086.40');
  });
});

describe('assertInstallablePurchase', () => {
  it('accepts a charge with the card, with or without interest', () => {
    expect(() => {
      assertInstallablePurchase(PURCHASE, CARD, null);
    }).not.toThrow();
    expect(() => {
      assertInstallablePurchase(PURCHASE, CARD, pen('1086.40'));
    }).not.toThrow();
  });

  it('refuses a purchase with another card', () => {
    expect(() => {
      assertInstallablePurchase(PURCHASE, 'method-other', null);
    }).toThrow(InstallmentPurchaseNotOnCardError);
  });

  it('refuses an income', () => {
    expect(() => {
      assertInstallablePurchase({ ...PURCHASE, type: 'INCOME' }, CARD, null);
    }).toThrow(InstallmentPurchaseNotAChargeError);
  });

  it('refuses a bank total below the price', () => {
    expect(() => {
      assertInstallablePurchase(PURCHASE, CARD, pen('999.99'));
    }).toThrow(InstallmentTotalBelowPriceError);
  });

  it('refuses a total in another currency', () => {
    expect(() => {
      assertInstallablePurchase(PURCHASE, CARD, Money.of('1000.00', 'USD'));
    }).toThrow(CurrencyMismatchError);
  });

  it('explains the errors with stable codes', () => {
    expect(new InstallmentPurchaseNotOnCardError().code).toBe('INSTALLMENT_PURCHASE_NOT_ON_CARD');
    expect(new InstallmentPurchaseNotOnCardError().message).toBe(
      'Only a purchase made with this card can be paid in installments on it.',
    );
    expect(new InstallmentPurchaseNotAChargeError().code).toBe('INSTALLMENT_PURCHASE_NOT_A_CHARGE');
    expect(new InstallmentPurchaseNotAChargeError().message).toBe(
      'An income cannot be paid in installments: only a charge to the card can.',
    );
  });
});
