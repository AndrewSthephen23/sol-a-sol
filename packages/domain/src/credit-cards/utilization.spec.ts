import { describe, expect, it } from 'vitest';

import { CurrencyMismatchError, Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  computeUtilization,
  CRITICAL_UTILIZATION_FROM,
  HIGH_UTILIZATION_ABOVE,
  NegativeCreditLimitError,
  PAYMENT_ALERT_DAYS,
  paymentAlert,
} from './utilization.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const date = (text: string) => LocalDate.parse(text);

describe('computeUtilization', () => {
  it('uses the thresholds decided on 2026-09-29', () => {
    expect(HIGH_UTILIZATION_ABOVE).toBe(30);
    expect(CRITICAL_UTILIZATION_FROM).toBe(70);
  });

  it.each([
    ['0.00', '0', 'OK'],
    ['1000.00', '20', 'OK'],
    // «> 30 %»: justo en el 30 % todavía está bien; un céntimo más ya es alto.
    ['1500.00', '30', 'OK'],
    ['1500.01', '30.0002', 'HIGH'],
    ['3499.99', '69.9998', 'HIGH'],
    // «≥ 70 %»: justo en el 70 % ya es crítico.
    ['3500.00', '70', 'CRITICAL'],
    ['5000.00', '100', 'CRITICAL'],
    ['6000.00', '120', 'CRITICAL'],
  ])('with S/ %s used of S/ 5000.00, is %s %% and %s', (used, percentage, level) => {
    const utilization = computeUtilization(pen('5000.00'), pen(used));

    expect(utilization.percentage?.toString()).toBe(percentage);
    expect(utilization.level).toBe(level);
  });

  it('keeps the percentage exact, without rounding', () => {
    const utilization = computeUtilization(pen('3000.00'), pen('1100.00'));

    expect(utilization.percentage?.toString()).toMatch(/^36\.6666666/u);
  });

  it('reads a balance in favour as OK', () => {
    const utilization = computeUtilization(pen('5000.00'), pen('-100.00'));

    expect(utilization.percentage?.toString()).toBe('-2');
    expect(utilization.level).toBe('OK');
  });

  it('has no percentage and no level with a zero credit limit, even with debt', () => {
    expect(computeUtilization(pen('0.00'), pen('250.00'))).toEqual({
      percentage: null,
      level: null,
    });
  });

  it('refuses a negative credit limit with its own error', () => {
    expect(() => computeUtilization(pen('-0.01'), pen('0.00'))).toThrow(NegativeCreditLimitError);
    expect(new NegativeCreditLimitError().code).toBe('CREDIT_LIMIT_NEGATIVE');
    expect(new NegativeCreditLimitError().message).toBe('A credit limit cannot be negative.');
  });

  it('refuses debt in another currency than the credit limit', () => {
    expect(() => computeUtilization(pen('5000.00'), Money.of('10.00', 'USD'))).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe('paymentAlert', () => {
  const due = date('2026-10-15');

  it('warns from 3 days before the due date', () => {
    expect(PAYMENT_ALERT_DAYS).toBe(3);
  });

  it.each([
    ['2026-10-12', 3],
    ['2026-10-14', 1],
    ['2026-10-15', 0],
  ])('on %s, with money due, warns that it is due in %d days', (today, daysLeft) => {
    expect(paymentAlert(date(today), due, pen('100.00'))).toEqual({ status: 'DUE_SOON', daysLeft });
  });

  it('does not warn 4 days before', () => {
    expect(paymentAlert(date('2026-10-11'), due, pen('100.00'))).toBeNull();
  });

  it.each([
    ['2026-10-16', -1],
    ['2026-11-01', -17],
  ])('on %s, with money due, warns that it is overdue by %d days', (today, daysLeft) => {
    expect(paymentAlert(date(today), due, pen('0.01'))).toEqual({ status: 'OVERDUE', daysLeft });
  });

  it.each(['0.00', '-50.00'])('does not warn with S/ %s due: it is paid', (amount) => {
    expect(paymentAlert(date('2026-10-15'), due, pen(amount))).toBeNull();
    expect(paymentAlert(date('2026-10-20'), due, pen(amount))).toBeNull();
  });
});
