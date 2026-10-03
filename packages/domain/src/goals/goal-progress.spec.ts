import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain-error.js';
import { CurrencyMismatchError, Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  AT_RISK_GAP_ABOVE,
  computeGoalProgress,
  type GoalMovement,
  type GoalProgressRequest,
} from './goal-progress.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const date = (text: string) => LocalDate.parse(text);
const contribution = (amount: string, on: string): GoalMovement => ({
  kind: 'CONTRIBUTION',
  amount: pen(amount),
  date: date(on),
});
const withdrawal = (amount: string, on: string): GoalMovement => ({
  kind: 'WITHDRAWAL',
  amount: pen(amount),
  date: date(on),
});

/** Meta de S/ 1,200.00 para todo 2026 (365 días), sin aportes; cada prueba cambia lo suyo. */
function progress(overrides: Partial<Omit<GoalProgressRequest, 'today'>> & { today: string }) {
  const { today, ...rest } = overrides;
  return computeGoalProgress({
    target: pen('1200.00'),
    startDate: date('2026-01-01'),
    endDate: date('2026-12-31'),
    contributions: [],
    ...rest,
    today: date(today),
  });
}

describe('computeGoalProgress', () => {
  it('uses the tolerance decided on 2026-10-03', () => {
    expect(AT_RISK_GAP_ABOVE).toBe(10);
  });

  it.each([
    ['a target of zero', { target: pen('0.00') }],
    ['an end on its start date', { endDate: date('2026-01-01') }],
  ])('refuses to measure a goal with %s', (_label, overrides) => {
    expect(() => progress({ ...overrides, today: '2026-06-15' })).toThrow(DomainError);
  });

  describe('saved, remaining and percentage', () => {
    it('starts at zero without contributions', () => {
      const result = progress({ today: '2026-01-15' });

      expect(result.saved.toFixed()).toBe('0.00');
      expect(result.remaining.toFixed()).toBe('1200.00');
      expect(result.excess.toFixed()).toBe('0.00');
      expect(result.percentage.toString()).toBe('0');
      expect(result.status).toBe('ON_TRACK');
    });

    it('adds the contributions halfway there', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('400.00', '2026-02-25'), contribution('200.00', '2026-05-25')],
      });

      expect(result.saved.toFixed()).toBe('600.00');
      expect(result.remaining.toFixed()).toBe('600.00');
      expect(result.percentage.toString()).toBe('50');
    });

    it('keeps the percentage exact, without rounding', () => {
      const result = progress({
        today: '2026-03-15',
        contributions: [contribution('100.00', '2026-02-25')],
      });

      expect(result.percentage.toString()).toMatch(/^8\.333333/u);
    });

    it('takes withdrawals off what was saved', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('800.00', '2026-02-25'), withdrawal('200.00', '2026-05-10')],
      });

      expect(result.saved.toFixed()).toBe('600.00');
      expect(result.remaining.toFixed()).toBe('600.00');
    });

    it('is achieved right at the target, with nothing left to contribute', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('1200.00', '2026-06-01')],
      });

      expect(result.percentage.toString()).toBe('100');
      expect(result.remaining.toFixed()).toBe('0.00');
      expect(result.excess.toFixed()).toBe('0.00');
      expect(result.suggestedMonthly?.toFixed()).toBe('0.00');
      expect(result.status).toBe('ACHIEVED');
    });

    it('is not achieved one cent short of the target', () => {
      const result = progress({
        today: '2026-12-15',
        contributions: [contribution('1199.99', '2026-12-01')],
      });

      expect(result.remaining.toFixed()).toBe('0.01');
      expect(result.status).toBe('ON_TRACK');
    });

    it('shows the real percentage and the excess past the target (decision 5)', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('1500.00', '2026-06-01')],
      });

      expect(result.percentage.toString()).toBe('125');
      expect(result.remaining.toFixed()).toBe('0.00');
      expect(result.excess.toFixed()).toBe('300.00');
      expect(result.status).toBe('ACHIEVED');
    });

    it('does not count a contribution dated after today yet', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('300.00', '2026-06-15'), contribution('500.00', '2026-06-16')],
      });

      expect(result.saved.toFixed()).toBe('300.00');
    });

    it('counts a contribution dated before the goal starts: the money is there', () => {
      const result = progress({
        today: '2026-06-15',
        contributions: [contribution('300.00', '2025-12-20')],
      });

      expect(result.saved.toFixed()).toBe('300.00');
    });

    it('shows what was saved as it is when withdrawals leave it below zero', () => {
      // Pasa si se borra una transacción enlazada: un retiro nuevo así se rechaza antes.
      const result = progress({
        today: '2026-06-15',
        contributions: [withdrawal('100.00', '2026-05-10')],
      });

      expect(result.saved.toFixed()).toBe('-100.00');
      expect(result.remaining.toFixed()).toBe('1300.00');
      expect(result.excess.toFixed()).toBe('0.00');
      expect(result.percentage.toString()).toMatch(/^-8\.333333/u);
    });

    it('refuses a contribution in another currency', () => {
      expect(() =>
        progress({
          today: '2026-06-15',
          contributions: [
            { kind: 'CONTRIBUTION', amount: Money.of('10.00', 'USD'), date: date('2026-06-01') },
          ],
        }),
      ).toThrow(CurrencyMismatchError);
    });
  });

  describe('suggested monthly contribution (decision 3)', () => {
    it('splits what is left among the months left, the current one included', () => {
      expect(progress({ today: '2026-01-15' }).suggestedMonthly?.toFixed()).toBe('100.00');
    });

    it('rounds up to the cent, so contributing it never falls short', () => {
      const result = progress({
        today: '2026-10-03',
        contributions: [contribution('200.00', '2026-02-25')],
      });

      // S/ 1,000.00 entre octubre, noviembre y diciembre: 333.333… → 333.34.
      expect(result.suggestedMonthly?.toFixed()).toBe('333.34');
    });

    it('does not add a cent when the split is exact', () => {
      const result = progress({
        today: '2026-10-03',
        contributions: [contribution('300.00', '2026-02-25')],
      });

      expect(result.suggestedMonthly?.toFixed()).toBe('300.00');
    });

    it('asks for everything that is left in the last month', () => {
      expect(progress({ today: '2026-12-31' }).suggestedMonthly?.toFixed()).toBe('1200.00');
    });

    it('counts the months across the new year', () => {
      const result = progress({
        endDate: date('2027-02-28'),
        today: '2026-11-20',
      });

      // Noviembre, diciembre, enero y febrero.
      expect(result.suggestedMonthly?.toFixed()).toBe('300.00');
    });

    it('counts from the start month for a goal that has not started yet', () => {
      const result = progress({
        target: pen('400.00'),
        startDate: date('2026-11-15'),
        endDate: date('2027-02-14'),
        today: '2026-10-03',
      });

      expect(result.suggestedMonthly?.toFixed()).toBe('100.00');
      expect(result.status).toBe('ON_TRACK');
    });

    it('has no suggestion once the end date has passed', () => {
      expect(progress({ today: '2027-01-01' }).suggestedMonthly).toBeNull();
    });
  });

  describe('status (decision 4)', () => {
    /** Meta de S/ 1,000.00 del 1 de enero al 10 de abril de 2026: 100 días justos. */
    function hundredDays(saved: string, today: string) {
      return progress({
        target: pen('1000.00'),
        endDate: date('2026-04-10'),
        contributions: [contribution(saved, '2026-02-25')],
        today,
      });
    }

    it('expects the straight-line progress at the end of the previous month', () => {
      // Al 28 de febrero van 59 de 100 días.
      expect(hundredDays('490.00', '2026-03-15').expectedPercentage.toString()).toBe('59');
    });

    it('is on track exactly 10 points behind', () => {
      expect(hundredDays('490.00', '2026-03-15').status).toBe('ON_TRACK');
    });

    it('is at risk one cent further behind', () => {
      expect(hundredDays('489.99', '2026-03-15').status).toBe('AT_RISK');
    });

    it('gives the whole month to contribute: nothing is expected during the first one', () => {
      const result = progress({ today: '2026-01-31' });

      expect(result.expectedPercentage.toString()).toBe('0');
      expect(result.status).toBe('ON_TRACK');
    });

    it('does not mark at risk the day before a monthly contribution', () => {
      // S/ 300.00 del 1 de enero al 31 de marzo, S/ 100.00 cada día 25: el 24 de febrero se
      // espera lo del 31 de enero (31 de 90 días, 34.44 %) y van S/ 100.00 (33.33 %).
      const result = progress({
        target: pen('300.00'),
        endDate: date('2026-03-31'),
        contributions: [contribution('100.00', '2026-01-25')],
        today: '2026-02-24',
      });

      expect(result.expectedPercentage.toString()).toMatch(/^34\.444/u);
      expect(result.status).toBe('ON_TRACK');
    });

    it('counts the days from a start in the middle of a month', () => {
      // Del 20 al 31 de enero van 12 de los 31 días hasta el 19 de febrero.
      const result = progress({
        startDate: date('2026-01-20'),
        endDate: date('2026-02-19'),
        today: '2026-02-10',
      });

      expect(result.expectedPercentage.toString()).toMatch(/^38\.709677/u);
    });

    it.each([
      ['2026', '28 of 59', /^47\.457627/u],
      ['2028', '29 of 60', /^48\.333333/u],
    ])('measures February %s at its real length (%s days)', (year, _days, expected) => {
      const result = progress({
        startDate: date(`${year}-02-01`),
        endDate: date(`${year}-03-31`),
        today: `${year}-03-01`,
      });

      expect(result.expectedPercentage.toString()).toMatch(expected);
    });

    it('expects nothing yet from a goal that has not started', () => {
      const result = progress({
        startDate: date('2026-11-15'),
        endDate: date('2027-02-14'),
        today: '2026-11-10',
      });

      expect(result.expectedPercentage.toString()).toBe('0');
      expect(result.status).toBe('ON_TRACK');
    });

    it('is overdue after the end date without reaching the target', () => {
      const result = progress({
        endDate: date('2026-03-15'),
        contributions: [contribution('1199.99', '2026-03-10')],
        today: '2026-03-16',
      });

      expect(result.status).toBe('OVERDUE');
      expect(result.expectedPercentage.toString()).toBe('100');
    });

    it('is still on track on its end date', () => {
      const result = progress({
        endDate: date('2026-03-15'),
        contributions: [contribution('1199.99', '2026-03-10')],
        today: '2026-03-15',
      });

      expect(result.status).toBe('ON_TRACK');
      expect(result.suggestedMonthly?.toFixed()).toBe('0.01');
    });

    it('stays achieved after the end date', () => {
      const result = progress({
        endDate: date('2026-03-15'),
        contributions: [contribution('1200.00', '2026-03-10')],
        today: '2026-05-01',
      });

      expect(result.status).toBe('ACHIEVED');
      expect(result.suggestedMonthly?.toFixed()).toBe('0.00');
    });

    it('goes back to on track if a withdrawal leaves it below the target', () => {
      const result = progress({
        contributions: [contribution('1200.00', '2026-03-10'), withdrawal('0.01', '2026-03-12')],
        today: '2026-03-15',
      });

      expect(result.status).toBe('ON_TRACK');
    });
  });
});
