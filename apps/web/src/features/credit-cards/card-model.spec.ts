import { describe, expect, it } from 'vitest';

import type { CardWithStatus } from './card-alerts-model';
import {
  acceptedCurrencies,
  type CardDraft,
  cardApiError,
  checkCardDraft,
  cycleText,
  daysLeftText,
  debtText,
  draftFor,
  dueText,
  paidText,
  utilizationBar,
  utilizationText,
} from './card-model';

const EMPTY = draftFor(null, null);

function draft(extra: Partial<CardDraft>): CardDraft {
  return {
    ...EMPTY,
    creditLimit: '5,000.00',
    statementDay: '20',
    ruleValue: '25',
    ...extra,
  };
}

const STATEMENT: NonNullable<CardWithStatus['status']['statement']> = {
  start: '2026-08-21',
  end: '2026-09-20',
  dueDate: '2026-10-15',
  daysLeft: 16,
  paid: false,
  balances: [
    { currency: 'PEN', balance: '110.00', credited: '65.00', remaining: '45.00' },
    { currency: 'USD', balance: '20.00', credited: '0.00', remaining: '20.00' },
  ],
};

describe('draftFor', () => {
  it('starts empty, in the currency of the card or in soles when it takes both', () => {
    expect(draftFor(null, 'USD')).toMatchObject({ creditLimit: '', creditLimitCurrency: 'USD' });
    expect(EMPTY).toMatchObject({
      creditLimitCurrency: 'PEN',
      rule: 'DAYS_AFTER_STATEMENT',
      hasOpeningBalance: false,
    });
  });

  it('fills in what the card already has', () => {
    const card = {
      creditLimit: { amount: '5000.00', currency: 'PEN' },
      statementDay: 20,
      paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
      openingBalance: { date: '2026-09-01', amounts: [{ amount: '80.00', currency: 'USD' }] },
    } as CardWithStatus;

    expect(draftFor(card, null)).toEqual({
      creditLimit: '5000.00',
      creditLimitCurrency: 'PEN',
      statementDay: '20',
      rule: 'DAY_OF_MONTH',
      ruleValue: '5',
      hasOpeningBalance: true,
      openingDate: '2026-09-01',
      openingPen: '',
      openingUsd: '80.00',
    });
  });
});

describe('acceptedCurrencies', () => {
  it('is both for a dual-currency card, and its own otherwise', () => {
    expect(acceptedCurrencies(null)).toEqual(['PEN', 'USD']);
    expect(acceptedCurrencies('USD')).toEqual(['USD']);
  });
});

describe('checkCardDraft', () => {
  it('builds the body with the amounts as decimal text', () => {
    expect(checkCardDraft(draft({}), ['PEN', 'USD'])).toEqual({
      body: {
        creditLimit: { amount: '5000.00', currency: 'PEN' },
        statementDay: 20,
        paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
        openingBalance: null,
      },
    });
  });

  it('builds a fixed payment day, a zero line and an opening balance per currency', () => {
    const checked = checkCardDraft(
      draft({
        creditLimit: '0',
        rule: 'DAY_OF_MONTH',
        ruleValue: '5',
        hasOpeningBalance: true,
        openingDate: '2026-09-01',
        openingPen: 'S/ 1,200.50',
        openingUsd: '0',
      }),
      ['PEN', 'USD'],
    );

    expect(checked).toEqual({
      body: {
        creditLimit: { amount: '0.00', currency: 'PEN' },
        statementDay: 20,
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
        openingBalance: {
          date: '2026-09-01',
          amounts: [
            { amount: '1200.50', currency: 'PEN' },
            { amount: '0.00', currency: 'USD' },
          ],
        },
      },
    });
  });

  it('only reads the opening balance in the currencies the card takes', () => {
    const checked = checkCardDraft(
      draft({
        hasOpeningBalance: true,
        openingDate: '2026-09-01',
        openingPen: '10',
        openingUsd: '99',
      }),
      ['PEN'],
    );

    expect(checked).toMatchObject({
      body: { openingBalance: { amounts: [{ amount: '10.00', currency: 'PEN' }] } },
    });
  });

  it.each([
    ['an empty line', { creditLimit: '' }, 'creditLimit', /línea de crédito/u],
    ['three decimals', { creditLimit: '100.005' }, 'creditLimit', /2 decimales/u],
    ['a negative line', { creditLimit: '-1' }, 'creditLimit', /negativa|negativo/u],
    ['a line in dollars', { creditLimit: 'US$ 100' }, 'creditLimit', /en dólares, no en soles/u],
    ['statement day 0', { statementDay: '0' }, 'statementDay', /1 al 31/u],
    ['statement day 32', { statementDay: '32' }, 'statementDay', /1 al 31/u],
    ['a statement day with decimals', { statementDay: '20.5' }, 'statementDay', /1 al 31/u],
    ['61 days after', { ruleValue: '61' }, 'ruleValue', /1 al 60/u],
    ['payment day 32', { rule: 'DAY_OF_MONTH' as const, ruleValue: '32' }, 'ruleValue', /1 al 31/u],
    [
      'an opening balance without amounts',
      { hasOpeningBalance: true, openingDate: '2026-09-01' },
      'openingBalance',
      /al menos una moneda/u,
    ],
    [
      'an opening balance without date',
      { hasOpeningBalance: true, openingPen: '10' },
      'openingBalance',
      /desde qué fecha/u,
    ],
    [
      'a negative opening balance',
      { hasOpeningBalance: true, openingDate: '2026-09-01', openingPen: '-10' },
      'openingBalance',
      /negativo/u,
    ],
  ])('marks %s next to its field', (_case, extra, field, message) => {
    const checked = checkCardDraft(draft(extra), ['PEN', 'USD']);

    expect('errors' in checked && checked.errors[field as keyof typeof checked.errors]).toMatch(
      message,
    );
  });
});

describe('cardApiError', () => {
  it('puts a rule of the API next to its field, in Spanish', () => {
    expect(cardApiError('STATEMENT_DAY_INVALID')).toEqual({
      field: 'statementDay',
      message: 'El día de corte va del 1 al 31.',
    });
    expect(cardApiError('OPENING_BALANCE_DATE_IN_FUTURE')?.field).toBe('openingBalance');
  });

  it('leaves the rest for the whole form, and knows nothing of unknown codes', () => {
    expect(cardApiError('CREDIT_CARD_ALREADY_CONFIGURED')?.field).toBeNull();
    expect(cardApiError('SOMETHING_ELSE')).toBeNull();
    expect(cardApiError(null)).toBeNull();
  });
});

describe('status texts', () => {
  it('writes the cycle without the weekday', () => {
    expect(cycleText({ start: '2026-09-21', end: '2026-10-20' })).toBe(
      'Del 21 de setiembre al 20 de octubre',
    );
  });

  it('writes what is owed, or the balance in favour', () => {
    expect(debtText('1245.00', 'PEN')).toBe('Debes S/ 1,245.00');
    expect(debtText('-50.00', 'USD')).toBe('Saldo a favor: US$ 50.00');
  });

  it.each([
    ['OK', '24.5', 'Usas el 24.50 % de tu línea de S/ 1,000.00'],
    ['HIGH', '36.666666', 'Usas el 36.67 % de tu línea de S/ 1,000.00: uso alto'],
    ['CRITICAL', '70', 'Usas el 70.00 % de tu línea de S/ 1,000.00: uso crítico'],
  ] as const)('writes a %s utilization in words', (level, percentage, text) => {
    expect(utilizationText({ percentage, level }, { amount: '1000.00', currency: 'PEN' })).toBe(
      text,
    );
  });

  it('has no percentage with a zero line', () => {
    expect(
      utilizationText({ percentage: null, level: null }, { amount: '0.00', currency: 'PEN' }),
    ).toBe('Sin línea propia: no hay porcentaje de uso (—).');
  });

  it.each([
    [16, 'en 16 días'],
    [1, 'mañana'],
    [0, 'hoy'],
    [-1, 'venció ayer'],
    [-4, 'venció hace 4 días'],
  ])('says %d days left as «%s»', (days, text) => {
    expect(daysLeftText(days)).toBe(text);
  });

  it('writes the payment due date, never an expiry', () => {
    expect(dueText(STATEMENT)).toBe('Fecha límite de pago: jueves, 15 de octubre (en 16 días)');
  });

  it('says it is paid, or what is left in each currency', () => {
    expect(paidText({ ...STATEMENT, paid: true })).toBe('Pagado');
    expect(paidText(STATEMENT)).toBe('Falta pagar S/ 45.00 y US$ 20.00');
  });

  it('fills the bar between 0 and 100, and leaves it empty without a line', () => {
    expect(utilizationBar('24.5')).toBe(24.5);
    expect(utilizationBar('120')).toBe(100);
    expect(utilizationBar('-2')).toBe(0);
    expect(utilizationBar(null)).toBe(0);
  });
});
