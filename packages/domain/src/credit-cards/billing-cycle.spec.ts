import { describe, expect, it } from 'vitest';

import { LocalDate } from '../time/local-date.js';
import {
  assertPaymentDueRule,
  assertStatementDay,
  type BillingCycle,
  computeBillingCycle,
  computePaymentDueDate,
  InvalidPaymentDueRuleError,
  InvalidStatementDayError,
  MAX_DAYS_AFTER_STATEMENT,
  nextBillingCycle,
  type PaymentDueRule,
  previousBillingCycle,
} from './billing-cycle.js';

const date = (text: string) => LocalDate.parse(text);
const text = (cycle: BillingCycle) => `${cycle.start.toString()}..${cycle.end.toString()}`;

describe('assertStatementDay', () => {
  it.each([1, 15, 31])('accepts day %d', (day) => {
    expect(() => {
      assertStatementDay(day);
    }).not.toThrow();
  });

  it.each([0, 32, -1, 1.5, Number.NaN])('refuses day %d with its own error', (day) => {
    expect(() => {
      assertStatementDay(day);
    }).toThrow(InvalidStatementDayError);
  });

  it('explains the error with a stable code', () => {
    const error = new InvalidStatementDayError(32);

    expect(error.code).toBe('STATEMENT_DAY_INVALID');
    expect(error.message).toBe('The statement day must be a day of the month, 1 to 31: got 32.');
  });
});

describe('computeBillingCycle', () => {
  describe('with the statement on the 20th', () => {
    it.each([
      ['2026-09-10', '2026-08-21..2026-09-20'],
      ['2026-08-21', '2026-08-21..2026-09-20'],
      // Decisión 4: la compra del día de corte entra en el estado que cierra ese día.
      ['2026-09-20', '2026-08-21..2026-09-20'],
      ['2026-09-21', '2026-09-21..2026-10-20'],
    ])('puts %s in %s', (day, cycle) => {
      expect(text(computeBillingCycle(20, date(day)))).toBe(cycle);
    });
  });

  describe('with a statement day the month does not have: it falls on the last day', () => {
    it.each([
      ['2026-02-15', '2026-02-01..2026-02-28'],
      ['2028-02-15', '2028-02-01..2028-02-29'],
      ['2026-03-01', '2026-03-01..2026-03-31'],
      ['2026-04-10', '2026-04-01..2026-04-30'],
      ['2026-05-01', '2026-05-01..2026-05-31'],
    ])('with the 31st, puts %s in %s', (day, cycle) => {
      expect(text(computeBillingCycle(31, date(day)))).toBe(cycle);
    });

    it.each([
      ['2026-02-10', '2026-01-31..2026-02-28'],
      ['2026-03-01', '2026-03-01..2026-03-30'],
      ['2026-03-31', '2026-03-31..2026-04-30'],
    ])('with the 30th, puts %s in %s', (day, cycle) => {
      expect(text(computeBillingCycle(30, date(day)))).toBe(cycle);
    });

    it.each([
      ['2026-02-28', '2026-01-30..2026-02-28'],
      ['2028-02-29', '2028-01-30..2028-02-29'],
      ['2026-03-01', '2026-03-01..2026-03-29'],
    ])('with the 29th, puts %s in %s', (day, cycle) => {
      expect(text(computeBillingCycle(29, date(day)))).toBe(cycle);
    });
  });

  it.each([
    ['2026-09-01', '2026-08-02..2026-09-01'],
    ['2026-09-02', '2026-09-02..2026-10-01'],
  ])('with the statement on the 1st, puts %s in %s', (day, cycle) => {
    expect(text(computeBillingCycle(1, date(day)))).toBe(cycle);
  });

  it.each([
    [20, '2026-12-25', '2026-12-21..2027-01-20'],
    [20, '2027-01-05', '2026-12-21..2027-01-20'],
    [10, '2027-01-05', '2026-12-11..2027-01-10'],
    [31, '2027-01-01', '2027-01-01..2027-01-31'],
    [31, '2026-12-31', '2026-12-01..2026-12-31'],
  ])('crosses the year: with the %dth, puts %s in %s', (statementDay, day, cycle) => {
    expect(text(computeBillingCycle(statementDay, date(day)))).toBe(cycle);
  });

  it('refuses an invalid statement day', () => {
    expect(() => computeBillingCycle(0, date('2026-09-10'))).toThrow(InvalidStatementDayError);
  });

  it('chains cycles without gaps or overlaps, every day of two years and every statement day', () => {
    const first = date('2027-12-01');
    for (let statementDay = 1; statementDay <= 31; statementDay++) {
      for (let offset = 0; offset < 800; offset++) {
        const day = first.plusDays(offset);
        const cycle = computeBillingCycle(statementDay, day);

        expect(day.isBefore(cycle.start)).toBe(false);
        expect(day.isAfter(cycle.end)).toBe(false);
        expect(computeBillingCycle(statementDay, cycle.start.plusDays(-1)).end).toEqual(
          cycle.start.plusDays(-1),
        );
        expect(cycle.end.day).toBe(Math.min(statementDay, cycle.end.lastDayOfMonth().day));
      }
    }
  });
});

describe('previousBillingCycle and nextBillingCycle', () => {
  it('walk around a short month', () => {
    const february = computeBillingCycle(31, date('2026-02-15'));

    expect(text(previousBillingCycle(31, february))).toBe('2026-01-01..2026-01-31');
    expect(text(nextBillingCycle(31, february))).toBe('2026-03-01..2026-03-31');
  });

  it('cross the year both ways', () => {
    const january = computeBillingCycle(20, date('2027-01-05'));

    expect(text(previousBillingCycle(20, january))).toBe('2026-11-21..2026-12-20');
    expect(text(nextBillingCycle(20, january))).toBe('2027-01-21..2027-02-20');
  });
});

describe('assertPaymentDueRule', () => {
  it.each<PaymentDueRule>([
    { kind: 'DAYS_AFTER_STATEMENT', days: 1 },
    { kind: 'DAYS_AFTER_STATEMENT', days: MAX_DAYS_AFTER_STATEMENT },
    { kind: 'DAY_OF_MONTH', day: 1 },
    { kind: 'DAY_OF_MONTH', day: 31 },
  ])('accepts %o', (rule) => {
    expect(() => {
      assertPaymentDueRule(rule);
    }).not.toThrow();
  });

  it.each<PaymentDueRule>([
    { kind: 'DAYS_AFTER_STATEMENT', days: 0 },
    { kind: 'DAYS_AFTER_STATEMENT', days: MAX_DAYS_AFTER_STATEMENT + 1 },
    { kind: 'DAYS_AFTER_STATEMENT', days: 2.5 },
    { kind: 'DAY_OF_MONTH', day: 0 },
    { kind: 'DAY_OF_MONTH', day: 32 },
    { kind: 'DAY_OF_MONTH', day: 4.5 },
  ])('refuses %o with its own error', (rule) => {
    expect(() => {
      assertPaymentDueRule(rule);
    }).toThrow(InvalidPaymentDueRuleError);
  });

  it('refuses a rule it does not know', () => {
    const unknown = { kind: 'NEXT_FRIDAY' } as unknown as PaymentDueRule;

    expect(() => {
      assertPaymentDueRule(unknown);
    }).toThrow(InvalidPaymentDueRuleError);
  });

  it('allows up to 60 days after the statement', () => {
    expect(MAX_DAYS_AFTER_STATEMENT).toBe(60);
  });

  it('explains the error with a stable code', () => {
    const error = new InvalidPaymentDueRuleError('DAY_OF_MONTH', 32);

    expect(error.code).toBe('PAYMENT_DUE_RULE_INVALID');
    expect(error.message).toBe('Invalid payment due rule: "DAY_OF_MONTH" with 32.');
  });
});

describe('computePaymentDueDate', () => {
  describe('N days after the statement', () => {
    it.each([
      ['2026-09-20', 25, '2026-10-15'],
      ['2026-12-20', 25, '2027-01-14'],
      ['2028-02-10', 20, '2028-03-01'],
      // Sin ajuste por fines de semana ni feriados: el 18 de octubre de 2026 es domingo.
      ['2026-09-20', 28, '2026-10-18'],
    ])('from the statement on %s plus %d days is %s', (statement, days, due) => {
      const rule: PaymentDueRule = { kind: 'DAYS_AFTER_STATEMENT', days };

      expect(computePaymentDueDate(date(statement), rule).toString()).toBe(due);
    });
  });

  describe('a fixed day of the month: the first one after the statement', () => {
    it.each([
      ['2026-09-20', 5, '2026-10-05'],
      ['2026-09-20', 25, '2026-09-25'],
      // Decisión 5: un día de pago igual al de corte es del mes siguiente.
      ['2026-09-20', 20, '2026-10-20'],
      ['2026-09-20', 21, '2026-09-21'],
      ['2026-12-20', 5, '2027-01-05'],
      // Un día que el mes no tiene cae el último día.
      ['2026-09-15', 31, '2026-09-30'],
      ['2026-03-31', 31, '2026-04-30'],
      ['2026-04-30', 30, '2026-05-30'],
      // Decidido el 2026-09-29: nunca vence el mismo día del corte. Corte 28 y pago 29 en un
      // febrero de 28 días vence el 29 de marzo.
      ['2026-02-28', 29, '2026-03-29'],
      ['2028-02-28', 29, '2028-02-29'],
      ['2026-02-28', 31, '2026-03-31'],
      // Sin ajuste por fines de semana: el 4 de octubre de 2026 es domingo.
      ['2026-09-20', 4, '2026-10-04'],
    ])('from the statement on %s, day %d is %s', (statement, day, due) => {
      const rule: PaymentDueRule = { kind: 'DAY_OF_MONTH', day };

      expect(computePaymentDueDate(date(statement), rule).toString()).toBe(due);
    });
  });

  it('refuses an invalid rule', () => {
    const rule: PaymentDueRule = { kind: 'DAY_OF_MONTH', day: 32 };

    expect(() => computePaymentDueDate(date('2026-09-20'), rule)).toThrow(
      InvalidPaymentDueRuleError,
    );
  });

  it('always falls after the statement, every statement and every rule', () => {
    const first = date('2027-12-01');
    for (let offset = 0; offset < 800; offset++) {
      const statement = first.plusDays(offset);
      for (let day = 1; day <= 31; day++) {
        const due = computePaymentDueDate(statement, { kind: 'DAY_OF_MONTH', day });

        expect(due.isAfter(statement)).toBe(true);
        expect(statement.daysUntil(due)).toBeLessThanOrEqual(31);
      }
    }
  });
});
