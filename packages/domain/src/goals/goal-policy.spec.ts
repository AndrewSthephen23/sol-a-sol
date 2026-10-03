import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors/domain-error.js';
import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import {
  assertGoalContribution,
  assertGoalSettings,
  assertLinkableTransaction,
  assertWithdrawalCovered,
  FutureGoalContributionError,
  GoalContributionAmountNotPositiveError,
  GoalCurrencyMismatchError,
  GoalEndNotAfterStartError,
  GoalTargetNotPositiveError,
  GoalTransactionNotASavingError,
  GoalWithdrawalExceedsSavedError,
  linkedContribution,
  linkedContributionState,
} from './goal-policy.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const date = (text: string) => LocalDate.parse(text);
const saving = (type: TransactionType = 'SAVING', amount = pen('500.00')) => ({
  type,
  amount,
  date: date('2026-09-10'),
});

describe('assertGoalSettings', () => {
  const settings = {
    target: pen('3000.00'),
    startDate: date('2026-01-01'),
    endDate: date('2026-12-31'),
  };

  it('accepts a positive target with the end after the start', () => {
    expect(() => {
      assertGoalSettings(settings);
    }).not.toThrow();
  });

  it('accepts a goal several years long that started in the past (decision 6)', () => {
    expect(() => {
      assertGoalSettings({
        ...settings,
        startDate: date('2024-03-01'),
        endDate: date('2029-01-01'),
      });
    }).not.toThrow();
  });

  it('accepts a goal of two days', () => {
    expect(() => {
      assertGoalSettings({ ...settings, endDate: date('2026-01-02') });
    }).not.toThrow();
  });

  it.each(['0.00', '-0.01'])('refuses a target of %s', (target) => {
    const error = capture(() => {
      assertGoalSettings({ ...settings, target: pen(target) });
    });

    expect(error).toBeInstanceOf(GoalTargetNotPositiveError);
    expect(error).toMatchObject({
      code: 'GOAL_TARGET_NOT_POSITIVE',
      message: 'A savings goal needs a target above zero.',
    });
  });

  it.each([
    ['on its start date', '2026-01-01'],
    ['before its start date', '2025-12-31'],
  ])('refuses an end %s', (_label, endDate) => {
    const error = capture(() => {
      assertGoalSettings({ ...settings, endDate: date(endDate) });
    });

    expect(error).toBeInstanceOf(GoalEndNotAfterStartError);
    expect(error).toMatchObject({
      code: 'GOAL_END_NOT_AFTER_START',
      message: 'A savings goal must end after it starts.',
    });
  });
});

describe('assertGoalContribution', () => {
  const today = date('2026-10-03');

  it.each(['CONTRIBUTION', 'WITHDRAWAL'] as const)('accepts a %s up to today', (kind) => {
    expect(() => {
      assertGoalContribution({ kind, amount: pen('0.01'), date: today }, 'PEN', today);
    }).not.toThrow();
  });

  it('accepts one dated before the goal starts: it is money already saved', () => {
    expect(() => {
      assertGoalContribution(
        { kind: 'CONTRIBUTION', amount: pen('100.00'), date: date('2020-01-01') },
        'PEN',
        today,
      );
    }).not.toThrow();
  });

  it.each(['0.00', '-0.01'])('refuses an amount of %s: the kind says whether it adds', (amount) => {
    const error = capture(() => {
      assertGoalContribution(
        { kind: 'WITHDRAWAL', amount: pen(amount), date: today },
        'PEN',
        today,
      );
    });

    expect(error).toBeInstanceOf(GoalContributionAmountNotPositiveError);
    expect(error).toMatchObject({
      code: 'GOAL_CONTRIBUTION_AMOUNT_NOT_POSITIVE',
      message: 'A contribution or a withdrawal needs an amount above zero.',
    });
  });

  it('refuses another currency than the goal one', () => {
    const error = capture(() => {
      assertGoalContribution(
        { kind: 'CONTRIBUTION', amount: Money.of('10.00', 'USD'), date: today },
        'PEN',
        today,
      );
    });

    expect(error).toBeInstanceOf(GoalCurrencyMismatchError);
    expect(error).toMatchObject({
      code: 'GOAL_CURRENCY_MISMATCH',
      message: 'The goal is in PEN: got USD.',
    });
  });

  it('refuses a date after today', () => {
    const error = capture(() => {
      assertGoalContribution(
        { kind: 'CONTRIBUTION', amount: pen('10.00'), date: date('2026-10-04') },
        'PEN',
        today,
      );
    });

    expect(error).toBeInstanceOf(FutureGoalContributionError);
    expect(error).toMatchObject({
      code: 'GOAL_CONTRIBUTION_DATE_IN_FUTURE',
      message: 'A contribution cannot be dated after today: got 2026-10-04.',
    });
  });
});

describe('assertWithdrawalCovered', () => {
  it.each(['0.00', '0.01'])('accepts leaving S/ %s saved', (saved) => {
    expect(() => {
      assertWithdrawalCovered(pen(saved));
    }).not.toThrow();
  });

  it('refuses leaving the goal below zero', () => {
    const error = capture(() => {
      assertWithdrawalCovered(pen('-0.01'));
    });

    expect(error).toBeInstanceOf(GoalWithdrawalExceedsSavedError);
    expect(error).toMatchObject({
      code: 'GOAL_WITHDRAWAL_EXCEEDS_SAVED',
      message: 'A withdrawal cannot take out more than the goal has saved.',
    });
  });
});

describe('linked contributions', () => {
  it.each(['SAVING', 'INVESTMENT'] as const)('follow an active %s transaction', (type) => {
    expect(linkedContributionState(saving(type), 'PEN')).toBe('ACTIVE');
  });

  it('stop counting when the transaction is deleted', () => {
    expect(linkedContributionState(null, 'PEN')).toBe('TRANSACTION_DELETED');
  });

  it.each(['INCOME', 'FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'DEBT'] as const)(
    'stop counting when the transaction becomes %s',
    (type) => {
      expect(linkedContributionState(saving(type), 'PEN')).toBe('TRANSACTION_NOT_A_SAVING');
    },
  );

  it('stop counting when the transaction moves to another currency', () => {
    expect(linkedContributionState(saving('SAVING', Money.of('500.00', 'USD')), 'PEN')).toBe(
      'CURRENCY_MISMATCH',
    );
  });

  it('report the type before the currency', () => {
    expect(linkedContributionState(saving('INCOME', Money.of('500.00', 'USD')), 'PEN')).toBe(
      'TRANSACTION_NOT_A_SAVING',
    );
  });

  it('take the whole transaction, with its date, as a contribution', () => {
    const transaction = saving('INVESTMENT', pen('750.50'));

    expect(linkedContribution(transaction)).toEqual({
      kind: 'CONTRIBUTION',
      amount: transaction.amount,
      date: transaction.date,
    });
  });

  describe('assertLinkableTransaction', () => {
    it('accepts a saving or an investment in the goal currency', () => {
      expect(() => {
        assertLinkableTransaction(saving('INVESTMENT'), 'PEN');
      }).not.toThrow();
    });

    it('refuses a transaction that is not a saving or an investment', () => {
      const error = capture(() => {
        assertLinkableTransaction(saving('VARIABLE_EXPENSE'), 'PEN');
      });

      expect(error).toBeInstanceOf(GoalTransactionNotASavingError);
      expect(error).toMatchObject({
        code: 'GOAL_TRANSACTION_NOT_A_SAVING',
        message: 'Only a saving or an investment transaction can be linked to a goal.',
      });
    });

    it('refuses a transaction in another currency', () => {
      const error = capture(() => {
        assertLinkableTransaction(saving('SAVING', Money.of('500.00', 'USD')), 'PEN');
      });

      expect(error).toBeInstanceOf(GoalCurrencyMismatchError);
      expect(error).toMatchObject({ code: 'GOAL_CURRENCY_MISMATCH' });
    });
  });
});

function capture(action: () => void): DomainError {
  try {
    action();
  } catch (error) {
    return error as DomainError;
  }
  throw new Error('Expected an error');
}
