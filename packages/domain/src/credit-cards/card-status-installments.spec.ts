import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  type CardInstallmentPlan,
  type CardMovement,
  type CardStatus,
  computeCardStatus,
} from './card-status.js';
import type { CreditCardSettings } from './credit-card-settings.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const date = (text: string) => LocalDate.parse(text);
// Corte 20 y pago 25 días después. Hoy, 2026-09-29: ciclo en curso del 21/09 al 20/10; último
// estado cerrado el 20/09.
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

function purchase(day: string, amount: Money): CardMovement {
  return { date: date(day), kind: 'VARIABLE_EXPENSE', amount };
}

function plan(day: string, price: Money, total: Money, count: number): CardInstallmentPlan {
  return { purchaseDate: date(day), price, total, count };
}

function status(
  movements: CardMovement[],
  installmentPlans: CardInstallmentPlan[],
  extra: Partial<CreditCardSettings> = {},
) {
  return computeCardStatus({
    settings: settings(extra),
    movements,
    installmentPlans,
    today: TODAY,
  });
}

function plain(result: CardStatus) {
  return {
    currencies: result.currencies.map((entry) => [
      entry.currency,
      entry.debt.toFixed(),
      entry.cycleCharges.toFixed(),
      entry.pendingInstallments.toFixed(),
    ]),
    statement: result.statement?.balances.map((entry) => [
      entry.balance.currency,
      entry.balance.toFixed(),
      entry.remaining.toFixed(),
    ]),
  };
}

describe('computeCardStatus with installments', () => {
  it('owes the whole purchase plus interest, but the statement only the installments billed', () => {
    // S/ 300.00 en 3 cuotas con S/ 30.00 de interés: 110.00 el 20/09, el 20/10 y el 20/11.
    const result = status(
      [purchase('2026-09-10', pen('300.00'))],
      [plan('2026-09-10', pen('300.00'), pen('330.00'), 3)],
    );

    expect(plain(result)).toEqual({
      currencies: [['PEN', '330.00', '110.00', '220.00']],
      statement: [['PEN', '110.00', '110.00']],
    });
  });

  it('bills a purchase of the current cycle by its installment, not the whole purchase', () => {
    const result = status(
      [purchase('2026-09-25', pen('120.00')), purchase('2026-09-26', pen('15.00'))],
      [plan('2026-09-25', pen('120.00'), pen('120.00'), 2)],
    );

    expect(plain(result)).toEqual({
      currencies: [['PEN', '135.00', '75.00', '120.00']],
      statement: [['PEN', '0.00', '0.00']],
    });
  });

  it('bills a purchase on the statement day in that same statement', () => {
    const result = status(
      [purchase('2026-09-20', pen('100.00'))],
      [plan('2026-09-20', pen('100.00'), pen('100.00'), 4)],
    );

    expect(plain(result)).toEqual({
      currencies: [['PEN', '100.00', '25.00', '75.00']],
      statement: [['PEN', '25.00', '25.00']],
    });
  });

  it('owes nothing more once every installment is billed', () => {
    const result = status(
      [purchase('2026-06-10', pen('90.00'))],
      [plan('2026-06-10', pen('90.00'), pen('90.00'), 3)],
    );

    expect(plain(result)).toEqual({
      currencies: [['PEN', '90.00', '0.00', '0.00']],
      statement: [['PEN', '90.00', '90.00']],
    });
  });

  it('keeps each currency apart', () => {
    const result = status(
      [purchase('2026-09-10', pen('300.00')), purchase('2026-09-11', usd('60.00'))],
      [
        plan('2026-09-10', pen('300.00'), pen('300.00'), 3),
        plan('2026-09-11', usd('60.00'), usd('66.00'), 2),
      ],
    );

    expect(plain(result)).toEqual({
      currencies: [
        ['PEN', '300.00', '100.00', '200.00'],
        ['USD', '66.00', '33.00', '33.00'],
      ],
      statement: [
        ['PEN', '100.00', '100.00'],
        ['USD', '33.00', '33.00'],
      ],
    });
  });

  it('ignores a plan whose purchase came before the opening balance: it is already in it', () => {
    const result = status(
      [purchase('2026-09-10', pen('300.00'))],
      [plan('2026-09-10', pen('300.00'), pen('330.00'), 3)],
      { openingBalance: { date: date('2026-09-15'), amounts: [pen('500.00')] } },
    );

    expect(plain(result)).toEqual({
      currencies: [['PEN', '500.00', '0.00', '0.00']],
      statement: [['PEN', '500.00', '500.00']],
    });
  });

  it('follows the statement day of the card when it changes', () => {
    const result = status(
      [purchase('2026-09-10', pen('300.00'))],
      [plan('2026-09-10', pen('300.00'), pen('300.00'), 3)],
      { statementDay: 5 },
    );

    // Con corte 5: 05/10, 05/11 y 05/12. Hoy el ciclo va del 06/09 al 05/10.
    expect(plain(result)).toEqual({
      currencies: [['PEN', '300.00', '100.00', '300.00']],
      statement: [['PEN', '0.00', '0.00']],
    });
  });
});
