import { describe, expect, it } from 'vitest';

import { CurrencyMismatchError, InvalidAmountError, Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import { InvalidStatementDayError } from './billing-cycle.js';
import {
  computeInstallmentPlan,
  type Installment,
  installmentInterest,
  InstallmentTooSmallError,
  InstallmentTotalBelowPriceError,
  InvalidInstallmentCountError,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  pendingInstallments,
} from './installment-plan.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const date = (text: string) => LocalDate.parse(text);
const amounts = (plan: readonly Installment[]) => plan.map((item) => item.amount.toFixed());
const statements = (plan: readonly Installment[]) =>
  plan.map((item) => item.statementDate.toString());

function plan(total: string, count: number, purchase = '2026-09-10', statementDay = 20) {
  return computeInstallmentPlan({
    total: pen(total),
    count,
    statementDay,
    purchaseDate: date(purchase),
  });
}

describe('computeInstallmentPlan', () => {
  describe('amounts: never loses a cent, the extra cents go to the first ones', () => {
    it.each([
      ['100.00', 3, ['33.34', '33.33', '33.33']],
      ['100.00', 7, ['14.29', '14.29', '14.29', '14.29', '14.28', '14.28', '14.28']],
      ['0.05', 3, ['0.02', '0.02', '0.01']],
      ['1200.00', 12, Array.from({ length: 12 }, () => '100.00')],
    ])('splits S/ %s in %d', (total, count, expected) => {
      expect(amounts(plan(total, count))).toEqual(expected);
    });

    it.each([
      ['100.00', 3],
      ['999.99', 36],
      ['0.36', 36],
      ['1234.57', 7],
    ])('adds up to exactly S/ %s in %d installments', (total, count) => {
      const sum = plan(total, count).reduce((acc, item) => acc.add(item.amount), pen('0'));

      expect(sum.toFixed()).toBe(total);
    });

    it('keeps the currency of the total', () => {
      const [first] = computeInstallmentPlan({
        total: Money.of('90.00', 'USD'),
        count: 3,
        statementDay: 20,
        purchaseDate: date('2026-09-10'),
      });

      expect(first?.amount.currency).toBe('USD');
    });
  });

  it('numbers the installments from 1', () => {
    expect(plan('100.00', 3).map((item) => item.number)).toEqual([1, 2, 3]);
  });

  describe('statement dates: one statement per installment, from the one after the purchase', () => {
    it('bills the first in the statement that closes after the purchase', () => {
      expect(statements(plan('100.00', 3, '2026-09-10'))).toEqual([
        '2026-09-20',
        '2026-10-20',
        '2026-11-20',
      ]);
    });

    it('bills a purchase on the statement day in that same statement (decision 4)', () => {
      expect(statements(plan('100.00', 2, '2026-09-20'))).toEqual(['2026-09-20', '2026-10-20']);
    });

    it('bills a purchase the day after the statement in the next one', () => {
      expect(statements(plan('100.00', 2, '2026-09-21'))).toEqual(['2026-10-20', '2026-11-20']);
    });

    it('follows a statement day the month lacks, and crosses the year', () => {
      expect(statements(plan('100.00', 4, '2026-12-15', 31))).toEqual([
        '2026-12-31',
        '2027-01-31',
        '2027-02-28',
        '2027-03-31',
      ]);
    });

    it('refuses an invalid statement day', () => {
      expect(() => plan('100.00', 3, '2026-09-10', 32)).toThrow(InvalidStatementDayError);
    });
  });

  describe('count', () => {
    it('allows 2 to 36 installments (decided on 2026-09-29)', () => {
      expect(MIN_INSTALLMENTS).toBe(2);
      expect(MAX_INSTALLMENTS).toBe(36);
      expect(plan('100.00', 2)).toHaveLength(2);
      expect(plan('100.00', 36)).toHaveLength(36);
    });

    it.each([1, 0, 37, 2.5, Number.NaN])('refuses %d installments', (count) => {
      expect(() => plan('100.00', count)).toThrow(InvalidInstallmentCountError);
    });

    it('explains the error with a stable code', () => {
      const error = new InvalidInstallmentCountError(37);

      expect(error.code).toBe('INSTALLMENT_COUNT_INVALID');
      expect(error.message).toBe('An installment plan has 2 to 36 installments: got 37.');
    });
  });

  describe('total', () => {
    it('refuses a total that leaves an installment of zero', () => {
      expect(() => plan('0.02', 3)).toThrow(InstallmentTooSmallError);
      expect(amounts(plan('0.03', 3))).toEqual(['0.01', '0.01', '0.01']);
    });

    it.each(['0.00', '-10.00'])('refuses a total of S/ %s', (total) => {
      expect(() => plan(total, 2)).toThrow(InstallmentTooSmallError);
    });

    it('explains the error with a stable code', () => {
      const error = new InstallmentTooSmallError('0.02', 3);

      expect(error.code).toBe('INSTALLMENT_TOO_SMALL');
      expect(error.message).toBe('0.02 cannot be split in 3 installments of at least one cent.');
    });

    it('never gets a third decimal: Money refuses it before', () => {
      expect(() => pen('100.005')).toThrow(InvalidAmountError);
    });
  });
});

describe('pendingInstallments', () => {
  // Se arma dentro de cada prueba: si lanzara al recolectar, se caería el archivo entero.
  const installments = () => plan('300.00', 3, '2026-09-10');

  it.each([
    ['2026-09-10', 3],
    ['2026-09-19', 3],
    // El estado que cierra hoy ya lleva su cuota: se facturó.
    ['2026-09-20', 2],
    ['2026-10-19', 2],
    ['2026-10-20', 1],
    ['2026-11-20', 0],
    ['2027-06-01', 0],
  ])('on %s, %d are still to be billed', (today, pending) => {
    expect(pendingInstallments(installments(), date(today))).toHaveLength(pending);
  });

  it('keeps the last ones, in order', () => {
    expect(
      pendingInstallments(installments(), date('2026-09-20')).map((item) => item.number),
    ).toEqual([2, 3]);
  });
});

describe('installmentInterest', () => {
  it('is the total from the bank minus the price (decision 7)', () => {
    expect(installmentInterest(pen('1000.00'), pen('1086.40')).toFixed()).toBe('86.40');
  });

  it('is zero without interest', () => {
    expect(installmentInterest(pen('1000.00'), pen('1000.00')).isZero()).toBe(true);
  });

  it('refuses a total below the price', () => {
    expect(() => installmentInterest(pen('1000.00'), pen('999.99'))).toThrow(
      InstallmentTotalBelowPriceError,
    );
    expect(new InstallmentTotalBelowPriceError().code).toBe('INSTALLMENT_TOTAL_BELOW_PRICE');
    expect(new InstallmentTotalBelowPriceError().message).toBe(
      'The total to pay in installments cannot be less than the price.',
    );
  });

  it('refuses mixing currencies', () => {
    expect(() => installmentInterest(pen('1000.00'), Money.of('1000.00', 'USD'))).toThrow(
      CurrencyMismatchError,
    );
  });
});
