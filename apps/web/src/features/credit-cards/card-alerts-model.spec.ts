import { describe, expect, it } from 'vitest';

import { type CardWithStatus, cardAlerts, cardName } from './card-alerts-model';

type Status = CardWithStatus['status'];

const STATEMENT: NonNullable<Status['statement']> = {
  start: '2026-08-21',
  end: '2026-09-20',
  dueDate: '2026-10-16',
  daysLeft: 3,
  paid: false,
  balances: [{ currency: 'PEN', balance: '1234.50', credited: '0.00', remaining: '1234.50' }],
};

function card(status: Partial<Status> = {}, extra: Partial<CardWithStatus['paymentMethod']> = {}) {
  return {
    id: 'card-visa',
    paymentMethod: {
      id: 'method-visa',
      alias: 'Visa',
      institution: 'BCP',
      last4: '4321',
      currency: null,
      archived: false,
      ...extra,
    },
    creditLimit: { amount: '5000.00', currency: 'PEN' },
    statementDay: 20,
    paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 26 },
    openingBalance: null,
    status: {
      cycle: { start: '2026-09-21', end: '2026-10-20' },
      currencies: [],
      statement: STATEMENT,
      utilization: { percentage: '10', level: 'OK' },
      paymentAlert: null,
      ...status,
    },
  } as CardWithStatus;
}

describe('cardName', () => {
  it('joins alias, bank and last four digits', () => {
    expect(cardName(card())).toBe('Visa BCP •••• 4321');
  });

  it('does not repeat the bank already in the alias, and leaves out what is missing', () => {
    expect(cardName(card({}, { alias: 'Visa BCP' }))).toBe('Visa BCP •••• 4321');
    expect(cardName(card({}, { institution: null, last4: null }))).toBe('Visa');
  });
});

describe('cardAlerts', () => {
  it('has nothing to say about a card in order', () => {
    expect(cardAlerts([card()])).toEqual([]);
  });

  it('says how much of the line is used when it is high, with 2 decimals', () => {
    expect(cardAlerts([card({ utilization: { percentage: '36.666666', level: 'HIGH' } })])).toEqual(
      [
        {
          cardId: 'card-visa',
          name: 'Visa BCP •••• 4321',
          severity: 'WARNING',
          messages: ['Usas el 36.67 % de la línea'],
        },
      ],
    );
  });

  it('says it is critical from 70 %', () => {
    const [alert] = cardAlerts([card({ utilization: { percentage: '82.5', level: 'CRITICAL' } })]);

    expect(alert).toMatchObject({
      severity: 'CRITICAL',
      messages: ['Usas el 82.50 % de la línea: nivel crítico'],
    });
  });

  it.each([
    [3, 'en 3 días'],
    [1, 'mañana'],
    [0, 'hoy'],
  ])('says how much to pay and when, %d days before', (daysLeft, when) => {
    const [alert] = cardAlerts([card({ paymentAlert: { status: 'DUE_SOON', daysLeft } })]);

    expect(alert).toMatchObject({
      severity: 'WARNING',
      messages: [`Pagas S/ 1,234.50 el viernes, 16 de octubre, ${when}`],
    });
  });

  it('says an overdue payment is critical and what is left', () => {
    const [alert] = cardAlerts([card({ paymentAlert: { status: 'OVERDUE', daysLeft: -2 } })]);

    expect(alert).toMatchObject({
      severity: 'CRITICAL',
      messages: ['El pago venció el viernes, 16 de octubre: falta pagar S/ 1,234.50'],
    });
  });

  it('gives both reasons at once', () => {
    const [alert] = cardAlerts([
      card({
        utilization: { percentage: '40', level: 'HIGH' },
        paymentAlert: { status: 'DUE_SOON', daysLeft: 2 },
      }),
    ]);

    expect(alert?.messages).toEqual([
      'Usas el 40.00 % de la línea',
      'Pagas S/ 1,234.50 el viernes, 16 de octubre, en 2 días',
    ]);
  });

  function dualCurrency(penRemaining: string, usdRemaining: string) {
    return card({
      statement: {
        ...STATEMENT,
        balances: [
          { currency: 'PEN', balance: '45.00', credited: '0.00', remaining: penRemaining },
          { currency: 'USD', balance: '20.00', credited: '0.00', remaining: usdRemaining },
        ],
      },
      paymentAlert: { status: 'DUE_SOON', daysLeft: 3 },
    });
  }

  it('names every currency still owed on a dual-currency card', () => {
    const [alert] = cardAlerts([dualCurrency('45.00', '20.00')]);

    expect(alert?.messages).toEqual([
      'Pagas S/ 45.00 y US$ 20.00 el viernes, 16 de octubre, en 3 días',
    ]);
  });

  it('leaves out a currency already paid', () => {
    const [alert] = cardAlerts([dualCurrency('0.00', '20.00')]);

    expect(alert?.messages).toEqual(['Pagas US$ 20.00 el viernes, 16 de octubre, en 3 días']);
  });

  it('never warns about an archived card', () => {
    expect(
      cardAlerts([
        card(
          {
            utilization: { percentage: '90', level: 'CRITICAL' },
            paymentAlert: { status: 'OVERDUE', daysLeft: -5 },
          },
          { archived: true },
        ),
      ]),
    ).toEqual([]);
  });

  it('has no utilization to warn about with a zero line', () => {
    expect(cardAlerts([card({ utilization: { percentage: null, level: null } })])).toEqual([]);
  });
});
