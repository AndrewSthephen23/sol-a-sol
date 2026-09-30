import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  type CardMovement,
  type CardMovementKind,
  type CardStatus,
  cardMovementEffect,
  computeCardStatus,
} from './card-status.js';
import type { CreditCardSettings } from './credit-card-settings.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const date = (text: string) => LocalDate.parse(text);
// Corte 20 y pago 25 días después. Hoy, 2026-09-29: el ciclo en curso va del 21/09 al 20/10 y el
// último estado cerrado es el del 20/09 (del 21/08 al 20/09), que vence el 15/10.
const TODAY = date('2026-09-29');

function settings(extra: Partial<CreditCardSettings> = {}): CreditCardSettings {
  return {
    creditLimit: pen('5000.00'),
    statementDay: 20,
    paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    openingBalance: null,
    ...extra,
  };
}

function move(day: string, kind: CardMovementKind, amount: Money): CardMovement {
  return { date: date(day), kind, amount };
}

function status(movements: CardMovement[], extra: Partial<CreditCardSettings> = {}, today = TODAY) {
  return computeCardStatus({ settings: settings(extra), movements, today });
}

/** Lo que importa del estado, como texto: sin depender de cómo guarda `Money` sus decimales. */
function plain(result: CardStatus) {
  return {
    cycle: `${result.cycle.start.toString()}..${result.cycle.end.toString()}`,
    currencies: result.currencies.map((entry) => ({
      currency: entry.currency,
      debt: entry.debt.toFixed(),
      cycleCharges: entry.cycleCharges.toFixed(),
    })),
    statement:
      result.statement === null
        ? null
        : {
            cycle: `${result.statement.cycle.start.toString()}..${result.statement.cycle.end.toString()}`,
            dueDate: result.statement.dueDate.toString(),
            daysLeft: result.statement.daysLeft,
            paid: result.statement.paid,
            balances: result.statement.balances.map((entry) => [
              entry.balance.currency,
              entry.balance.toFixed(),
              entry.credited.toFixed(),
              entry.remaining.toFixed(),
            ]),
          },
    utilization: {
      percentage: result.utilization.percentage?.toString() ?? null,
      level: result.utilization.level,
    },
    paymentAlert: result.paymentAlert,
  };
}

describe('cardMovementEffect', () => {
  it.each(['FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'DEBT', 'SAVING', 'INVESTMENT'] as const)(
    'reads a %s with the card as a charge',
    (kind) => {
      expect(cardMovementEffect(kind)).toBe('CHARGE');
    },
  );

  it('reads a cash advance (a transfer out of the card) as a charge', () => {
    expect(cardMovementEffect('TRANSFER_OUT')).toBe('CHARGE');
  });

  it('reads a refund (an income to the card) as a credit', () => {
    expect(cardMovementEffect('INCOME')).toBe('CREDIT');
  });

  it('reads a payment (a transfer to the card) as a credit', () => {
    expect(cardMovementEffect('TRANSFER_IN')).toBe('CREDIT');
  });
});

describe('computeCardStatus', () => {
  it('shows a card without movements: nothing owed, statement paid, no alert', () => {
    expect(plain(status([]))).toEqual({
      cycle: '2026-09-21..2026-10-20',
      currencies: [{ currency: 'PEN', debt: '0.00', cycleCharges: '0.00' }],
      statement: {
        cycle: '2026-08-21..2026-09-20',
        dueDate: '2026-10-15',
        daysLeft: 16,
        paid: true,
        balances: [['PEN', '0.00', '0.00', '0.00']],
      },
      utilization: { percentage: '0', level: 'OK' },
      paymentAlert: null,
    });
  });

  it('adds up what was bought across cycles, and what the current cycle has', () => {
    const result = status([
      move('2026-08-25', 'VARIABLE_EXPENSE', pen('100.00')),
      // Decisión 4: la compra del día de corte entra en el estado que cierra ese día.
      move('2026-09-20', 'DEBT', pen('10.00')),
      move('2026-09-21', 'FIXED_EXPENSE', pen('40.00')),
      move('2026-09-29', 'VARIABLE_EXPENSE', pen('2.50')),
    ]);

    expect(plain(result).currencies).toEqual([
      { currency: 'PEN', debt: '152.50', cycleCharges: '42.50' },
    ]);
    expect(plain(result).statement?.balances).toEqual([['PEN', '110.00', '0.00', '110.00']]);
  });

  it('takes payments and refunds off the debt, and never counts them as charges', () => {
    const result = status([
      move('2026-09-10', 'VARIABLE_EXPENSE', pen('300.00')),
      move('2026-09-22', 'TRANSFER_IN', pen('100.00')),
      move('2026-09-23', 'INCOME', pen('50.00')),
    ]);

    expect(plain(result).currencies).toEqual([
      { currency: 'PEN', debt: '150.00', cycleCharges: '0.00' },
    ]);
  });

  it('counts a cash advance as debt and as a charge of the cycle', () => {
    const result = status([move('2026-09-25', 'TRANSFER_OUT', pen('200.00'))]);

    expect(plain(result).currencies).toEqual([
      { currency: 'PEN', debt: '200.00', cycleCharges: '200.00' },
    ]);
  });

  describe('the last closed statement', () => {
    it('owes the whole debt at the statement date, carrying what was not paid before', () => {
      const result = status([
        move('2026-07-30', 'VARIABLE_EXPENSE', pen('70.00')),
        move('2026-08-05', 'TRANSFER_IN', pen('20.00')),
        move('2026-09-01', 'VARIABLE_EXPENSE', pen('100.00')),
      ]);

      expect(plain(result).statement?.balances).toEqual([['PEN', '150.00', '0.00', '150.00']]);
    });

    it('is paid once what came in after the statement covers it', () => {
      const result = status([
        move('2026-09-01', 'VARIABLE_EXPENSE', pen('100.00')),
        move('2026-09-22', 'TRANSFER_IN', pen('60.00')),
        move('2026-09-25', 'INCOME', pen('40.00')),
        // Una compra después del corte es del próximo estado: no descuenta lo pagado.
        move('2026-09-26', 'VARIABLE_EXPENSE', pen('500.00')),
      ]);

      expect(plain(result).statement).toMatchObject({
        paid: true,
        balances: [['PEN', '100.00', '100.00', '0.00']],
      });
    });

    it('is not paid while something is left, and says how much', () => {
      const result = status([
        move('2026-09-01', 'VARIABLE_EXPENSE', pen('100.00')),
        move('2026-09-20', 'TRANSFER_IN', pen('30.00')),
        move('2026-09-21', 'TRANSFER_IN', pen('60.00')),
      ]);

      expect(plain(result).statement).toMatchObject({
        paid: false,
        balances: [['PEN', '70.00', '60.00', '10.00']],
      });
    });

    it('owes nothing when the balance is in favour', () => {
      const result = status([move('2026-09-10', 'TRANSFER_IN', pen('50.00'))]);

      expect(plain(result).statement).toMatchObject({
        paid: true,
        balances: [['PEN', '-50.00', '0.00', '0.00']],
      });
      expect(plain(result).currencies[0]?.debt).toBe('-50.00');
    });

    it('uses the payment rule of the card, and the day before the new cycle closes it', () => {
      const result = status([], { paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 } });

      expect(plain(result).statement).toMatchObject({ dueDate: '2026-10-05', daysLeft: 6 });
    });

    it('is still the previous one on the statement day itself: it closes at the end of the day', () => {
      const result = status([], {}, date('2026-10-20'));

      expect(plain(result)).toMatchObject({
        cycle: '2026-09-21..2026-10-20',
        statement: { cycle: '2026-08-21..2026-09-20', daysLeft: -5 },
      });
    });
  });

  describe('with a dual-currency card', () => {
    it('keeps each currency apart and never converts; utilization counts only the line currency', () => {
      const result = status([
        move('2026-09-01', 'VARIABLE_EXPENSE', pen('1600.00')),
        move('2026-09-02', 'VARIABLE_EXPENSE', usd('80.00')),
        move('2026-09-25', 'TRANSFER_IN', usd('80.00')),
      ]);

      expect(plain(result)).toMatchObject({
        currencies: [
          { currency: 'PEN', debt: '1600.00', cycleCharges: '0.00' },
          { currency: 'USD', debt: '0.00', cycleCharges: '0.00' },
        ],
        statement: {
          paid: false,
          balances: [
            ['PEN', '1600.00', '0.00', '1600.00'],
            ['USD', '80.00', '80.00', '0.00'],
          ],
        },
        utilization: { percentage: '32', level: 'HIGH' },
      });
    });

    it('lists soles first, even when dollars came first', () => {
      const result = status([move('2026-09-01', 'VARIABLE_EXPENSE', usd('1.00'))], {
        creditLimit: usd('1000.00'),
        openingBalance: { date: date('2026-08-01'), amounts: [pen('5.00')] },
      });

      expect(result.currencies.map((entry) => entry.currency)).toEqual(['PEN', 'USD']);
      expect(plain(result).utilization).toEqual({ percentage: '0.1', level: 'OK' });
    });

    it('always shows the line currency, even without movements in it', () => {
      const result = status([move('2026-09-01', 'VARIABLE_EXPENSE', usd('10.00'))]);

      expect(result.currencies.map((entry) => entry.currency)).toEqual(['PEN', 'USD']);
    });
  });

  describe('with an opening balance', () => {
    const opening = { date: date('2026-09-05'), amounts: [pen('1000.00'), usd('20.00')] };

    it('starts from it and counts only what came after its date', () => {
      const result = status(
        [
          move('2026-09-04', 'VARIABLE_EXPENSE', pen('999.00')),
          move('2026-09-05', 'VARIABLE_EXPENSE', pen('888.00')),
          move('2026-09-06', 'VARIABLE_EXPENSE', pen('100.00')),
          move('2026-09-22', 'TRANSFER_IN', usd('5.00')),
        ],
        { openingBalance: opening },
      );

      expect(plain(result).currencies).toEqual([
        { currency: 'PEN', debt: '1100.00', cycleCharges: '0.00' },
        { currency: 'USD', debt: '15.00', cycleCharges: '0.00' },
      ]);
      expect(plain(result).statement?.balances).toEqual([
        ['PEN', '1100.00', '0.00', '1100.00'],
        ['USD', '20.00', '5.00', '15.00'],
      ]);
    });

    it('shows a currency that has only an opening balance', () => {
      const result = status([], { openingBalance: opening });

      expect(plain(result).currencies).toEqual([
        { currency: 'PEN', debt: '1000.00', cycleCharges: '0.00' },
        { currency: 'USD', debt: '20.00', cycleCharges: '0.00' },
      ]);
    });

    it('counts it in the statement closed on its own date', () => {
      const result = status([], {
        openingBalance: { date: date('2026-09-20'), amounts: [pen('300.00')] },
      });

      expect(plain(result).statement?.balances).toEqual([['PEN', '300.00', '0.00', '300.00']]);
    });

    it('has no closed statement to show when the balance is dated after it', () => {
      const result = status([], {
        openingBalance: { date: date('2026-09-21'), amounts: [pen('300.00')] },
      });

      expect(result.statement).toBeNull();
      expect(result.paymentAlert).toBeNull();
      expect(plain(result).currencies[0]?.debt).toBe('300.00');
    });
  });

  describe('alerts', () => {
    it('warns about the payment from 3 days before, while something is left', () => {
      const movements = [move('2026-09-01', 'VARIABLE_EXPENSE', pen('100.00'))];

      expect(status(movements, {}, date('2026-10-11')).paymentAlert).toBeNull();
      expect(status(movements, {}, date('2026-10-12')).paymentAlert).toEqual({
        status: 'DUE_SOON',
        daysLeft: 3,
      });
      expect(status(movements, {}, date('2026-10-16')).paymentAlert).toEqual({
        status: 'OVERDUE',
        daysLeft: -1,
      });
    });

    it('warns about a statement owed only in dollars', () => {
      const movements = [move('2026-09-01', 'VARIABLE_EXPENSE', usd('10.00'))];

      expect(status(movements, {}, date('2026-10-14')).paymentAlert).toEqual({
        status: 'DUE_SOON',
        daysLeft: 1,
      });
    });

    it('does not warn once the statement is paid', () => {
      const movements = [
        move('2026-09-01', 'VARIABLE_EXPENSE', pen('100.00')),
        move('2026-10-01', 'TRANSFER_IN', pen('100.00')),
      ];

      expect(status(movements, {}, date('2026-10-14')).paymentAlert).toBeNull();
    });

    it('has no utilization with a zero line', () => {
      const result = status([move('2026-09-01', 'VARIABLE_EXPENSE', pen('10.00'))], {
        creditLimit: pen('0.00'),
      });

      expect(plain(result).utilization).toEqual({ percentage: null, level: null });
    });

    it('reaches CRITICAL from 70 % of the line', () => {
      const result = status([move('2026-09-01', 'VARIABLE_EXPENSE', pen('3500.00'))]);

      expect(plain(result).utilization).toEqual({ percentage: '70', level: 'CRITICAL' });
    });
  });
});
