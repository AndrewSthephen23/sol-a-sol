import { describe, expect, it } from 'vitest';

import { InvalidAmountError, Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import { InvalidPaymentDueRuleError, InvalidStatementDayError } from './billing-cycle.js';
import {
  assertConfigurableMethod,
  assertCreditCardSettings,
  CreditCardCurrencyNotAcceptedError,
  type CreditCardMethod,
  type CreditCardSettings,
  CreditCardMethodArchivedError,
  EmptyOpeningBalanceError,
  FutureOpeningBalanceError,
  NegativeOpeningBalanceError,
  NotACreditCardError,
  OpeningBalanceCurrencyRepeatedError,
} from './credit-card-settings.js';
import { NegativeCreditLimitError } from './utilization.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const TODAY = LocalDate.parse('2026-09-29');

function settings(extra: Partial<CreditCardSettings> = {}): CreditCardSettings {
  return {
    creditLimit: pen('5000.00'),
    statementDay: 20,
    paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    openingBalance: null,
    ...extra,
  };
}

function check(extra: Partial<CreditCardSettings> = {}, currency: 'PEN' | 'USD' | null = null) {
  assertCreditCardSettings(settings(extra), currency, TODAY);
}

describe('assertConfigurableMethod', () => {
  const card: CreditCardMethod = { kind: 'CREDIT_CARD', archived: false };

  it('accepts an active credit card', () => {
    expect(() => {
      assertConfigurableMethod(card);
    }).not.toThrow();
  });

  it.each(['ACCOUNT', 'WALLET', 'CASH'] as const)('refuses a %s', (kind) => {
    expect(() => {
      assertConfigurableMethod({ ...card, kind });
    }).toThrow(NotACreditCardError);
  });

  it('refuses an archived card: restore it first', () => {
    expect(() => {
      assertConfigurableMethod({ ...card, archived: true });
    }).toThrow(CreditCardMethodArchivedError);
  });

  it('explains the errors with stable codes', () => {
    expect(new NotACreditCardError().code).toBe('PAYMENT_METHOD_NOT_CREDIT_CARD');
    expect(new NotACreditCardError().message).toBe(
      'Only a credit card payment method can be set up as a credit card.',
    );
    expect(new CreditCardMethodArchivedError().code).toBe('PAYMENT_METHOD_ARCHIVED');
    expect(new CreditCardMethodArchivedError().message).toBe(
      'The payment method is archived: restore it to set it up as a credit card.',
    );
  });
});

describe('assertCreditCardSettings', () => {
  it('accepts a dual-currency card with its line in soles', () => {
    expect(() => {
      check();
    }).not.toThrow();
  });

  it('accepts a zero credit limit (an additional card)', () => {
    expect(() => {
      check({ creditLimit: pen('0.00') });
    }).not.toThrow();
  });

  it('refuses a negative credit limit', () => {
    expect(() => {
      check({ creditLimit: pen('-0.01') });
    }).toThrow(NegativeCreditLimitError);
  });

  it('never gets a third decimal: Money refuses it before', () => {
    expect(() => pen('5000.001')).toThrow(InvalidAmountError);
  });

  describe('currency of the line', () => {
    it('accepts the currency of a single-currency card', () => {
      expect(() => {
        check({ creditLimit: usd('1000.00') }, 'USD');
      }).not.toThrow();
    });

    it('refuses a currency the card does not accept', () => {
      expect(() => {
        check({ creditLimit: usd('1000.00') }, 'PEN');
      }).toThrow(CreditCardCurrencyNotAcceptedError);
    });

    it('explains the error with a stable code', () => {
      const error = new CreditCardCurrencyNotAcceptedError('USD', 'PEN');

      expect(error.code).toBe('CREDIT_CARD_CURRENCY_NOT_ACCEPTED');
      expect(error.message).toBe('The card only accepts PEN: got USD.');
    });
  });

  it('refuses an invalid statement day', () => {
    expect(() => {
      check({ statementDay: 32 });
    }).toThrow(InvalidStatementDayError);
  });

  it('refuses an invalid payment due rule', () => {
    expect(() => {
      check({ paymentDueRule: { kind: 'DAY_OF_MONTH', day: 0 } });
    }).toThrow(InvalidPaymentDueRuleError);
  });

  describe('opening balance', () => {
    const date = LocalDate.parse('2026-09-01');

    it('accepts one per currency on a dual-currency card, zero included', () => {
      expect(() => {
        check({ openingBalance: { date, amounts: [pen('1200.50'), usd('0.00')] } });
      }).not.toThrow();
    });

    it('accepts a balance dated today', () => {
      expect(() => {
        check({ openingBalance: { date: TODAY, amounts: [pen('1.00')] } });
      }).not.toThrow();
    });

    it('refuses a balance dated tomorrow: it would not say what came before', () => {
      expect(() => {
        check({ openingBalance: { date: TODAY.plusDays(1), amounts: [pen('1.00')] } });
      }).toThrow(FutureOpeningBalanceError);
    });

    it('refuses a balance without amounts', () => {
      expect(() => {
        check({ openingBalance: { date, amounts: [] } });
      }).toThrow(EmptyOpeningBalanceError);
    });

    it('refuses the same currency twice', () => {
      expect(() => {
        check({ openingBalance: { date, amounts: [pen('1.00'), pen('2.00')] } });
      }).toThrow(OpeningBalanceCurrencyRepeatedError);
    });

    it('refuses a negative balance', () => {
      expect(() => {
        check({ openingBalance: { date, amounts: [usd('-0.01')] } });
      }).toThrow(NegativeOpeningBalanceError);
    });

    it('refuses a balance in a currency the card does not accept', () => {
      expect(() => {
        check({ openingBalance: { date, amounts: [pen('10.00'), usd('5.00')] } }, 'PEN');
      }).toThrow(CreditCardCurrencyNotAcceptedError);
    });

    it('explains the errors with stable codes', () => {
      expect(new EmptyOpeningBalanceError().code).toBe('OPENING_BALANCE_EMPTY');
      expect(new EmptyOpeningBalanceError().message).toBe(
        'An opening balance needs an amount in at least one currency.',
      );
      expect(new OpeningBalanceCurrencyRepeatedError('PEN').code).toBe(
        'OPENING_BALANCE_CURRENCY_REPEATED',
      );
      expect(new OpeningBalanceCurrencyRepeatedError('PEN').message).toBe(
        'The opening balance has PEN twice.',
      );
      expect(new NegativeOpeningBalanceError().code).toBe('OPENING_BALANCE_NEGATIVE');
      expect(new NegativeOpeningBalanceError().message).toBe(
        'An opening balance cannot be negative.',
      );
      expect(new FutureOpeningBalanceError().code).toBe('OPENING_BALANCE_DATE_IN_FUTURE');
      expect(new FutureOpeningBalanceError().message).toBe(
        'The opening balance cannot be dated after today.',
      );
    });
  });
});
