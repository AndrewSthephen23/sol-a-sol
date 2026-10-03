import { describe, expect, it } from 'vitest';

import {
  budgetExecutionText,
  cardTitle,
  chargesText,
  comparisonText,
  contributedText,
  exceededText,
  goalProgressText,
  merchantText,
  type MonthlySummary,
  previousLabel,
  savingsRateText,
  shareText,
  type SummaryCard,
  type SummaryGoal,
  statementText,
} from './summary-model';

function summary(period: Partial<MonthlySummary['period']> = {}, previous = {}): MonthlySummary {
  return {
    year: 2026,
    month: 9,
    period: { from: '2026-09-01', to: '2026-09-30', complete: true, ...period },
    previousPeriod: { from: '2026-08-01', to: '2026-08-31', ...previous },
    currencies: [],
  };
}

const CARD: SummaryCard = {
  id: 'visa',
  alias: 'Visa',
  institution: 'BCP',
  last4: '4321',
  charges: [{ amount: '50.00', currency: 'PEN' }],
  statement: {
    closingDate: '2026-09-20',
    dueDate: '2026-10-15',
    balances: [{ currency: 'PEN', balance: '110.00', remaining: '45.00' }],
  },
};

const GOAL: SummaryGoal = {
  id: 'trip',
  name: 'Viaje',
  currency: 'PEN',
  contributed: '300.00',
  saved: '300.00',
  remaining: '900.00',
  percentage: '25',
  suggestedMonthly: '300.00',
  status: 'AT_RISK',
};

describe('what the summary is compared with', () => {
  it('names the previous month of a closed one', () => {
    expect(previousLabel(summary())).toBe('en agosto');
  });

  it('adds the year when the previous month is of another year', () => {
    expect(
      previousLabel(
        summary({ from: '2026-01-01', to: '2026-01-31' }, { from: '2025-12-01', to: '2025-12-31' }),
      ),
    ).toBe('en diciembre de 2025');
  });

  it('names the days compared in the month in course', () => {
    expect(
      previousLabel(
        summary(
          { from: '2026-10-01', to: '2026-10-03', complete: false },
          {
            from: '2026-09-01',
            to: '2026-09-03',
          },
        ),
      ),
    ).toBe('del 1 al 3 de setiembre');
  });
});

describe('comparisonText', () => {
  it.each([
    [
      { amount: '450.00', difference: '150.00', change: '50' },
      'S/ 150.00 más que en agosto (+50.00 %)',
    ],
    [
      { amount: '0.00', difference: '-50.00', change: '-100' },
      'S/ 50.00 menos que en agosto (-100.00 %)',
    ],
    [{ amount: '200.00', difference: '200.00', change: null }, 'S/ 200.00 más que en agosto (—)'],
    [{ amount: '10.00', difference: '0.00', change: '0' }, 'Igual que en agosto'],
  ])('says %o in words', (row, text) => {
    expect(comparisonText(row, 'PEN', 'en agosto')).toBe(text);
  });
});

describe('other texts', () => {
  it('says the savings rate, or that there was no income', () => {
    expect(savingsRateText('16.6666666')).toBe('Ahorraste el 16.67 % de lo que ganaste');
    expect(savingsRateText(null)).toBe('Sin ingresos este mes');
  });

  it('says the share of the expense, if any', () => {
    expect(shareText('57.142857')).toBe(' (57.14 % del gasto)');
    expect(shareText(null)).toBe('');
  });

  it('counts the purchases at a merchant', () => {
    expect(merchantText({ merchant: 'Tambo', amount: '110.00', count: 2 }, 'PEN')).toBe(
      'Tambo: S/ 110.00 en 2 compras',
    );
    expect(merchantText({ merchant: 'Wong', amount: '5.00', count: 1 }, 'USD')).toBe(
      'Wong: US$ 5.00 en 1 compra',
    );
  });

  it('says how much of the budget was used, and by how much a line went over', () => {
    expect(
      budgetExecutionText({
        currency: 'PEN',
        planned: '1500.00',
        actual: '1550.00',
        executed: '103.3333',
      }),
    ).toBe('Ejecutaste el 103.33 % de tu presupuesto: S/ 1,550.00 de S/ 1,500.00');
    expect(
      budgetExecutionText({ currency: 'PEN', planned: '0.00', actual: '5.00', executed: null }),
    ).toBe('Gastaste S/ 5.00 con un presupuesto de cero');
    expect(
      exceededText(
        {
          categoryId: 'food',
          type: 'VARIABLE_EXPENSE',
          currency: 'PEN',
          planned: '100.00',
          actual: '110.00',
          difference: '-10.00',
          executed: '110',
        },
        'Víveres',
      ),
    ).toBe('Víveres: te pasaste por S/ 10.00 (110.00 %)');
  });

  it('names a card only by what identifies it', () => {
    expect(cardTitle(CARD)).toBe('Visa BCP •••• 4321');
    expect(cardTitle({ ...CARD, institution: null, last4: null })).toBe('Visa');
  });

  it('says what was charged to a card and what is left to pay', () => {
    expect(chargesText(CARD, summary())).toBe('Consumiste S/ 50.00 en setiembre');
    expect(
      chargesText(
        { ...CARD, charges: [...CARD.charges, { amount: '20.00', currency: 'USD' }] },
        summary(),
      ),
    ).toBe('Consumiste S/ 50.00 y US$ 20.00 en setiembre');
    expect(chargesText({ ...CARD, charges: [] }, summary())).toBe('Sin consumos este mes');
    expect(statementText(CARD.statement ?? { closingDate: '', dueDate: '', balances: [] })).toBe(
      'Estado del 20 de setiembre: por pagar S/ 45.00 (fecha límite de pago: jueves, 15 de octubre)',
    );
    expect(
      statementText({
        closingDate: '2026-09-20',
        dueDate: '2026-10-15',
        balances: [{ currency: 'PEN', balance: '110.00', remaining: '0.00' }],
      }),
    ).toBe('Estado del 20 de setiembre: pagado (fecha límite de pago: jueves, 15 de octubre)');
  });

  it('says what was contributed to a goal and how it ended the month', () => {
    expect(contributedText(GOAL)).toBe('Aportaste S/ 300.00 este mes');
    expect(contributedText({ ...GOAL, contributed: '-50.00' })).toBe('Retiraste S/ 50.00 este mes');
    expect(contributedText({ ...GOAL, contributed: '0.00' })).toBe('Sin aportes este mes');
    expect(goalProgressText(GOAL)).toBe('Llevas S/ 300.00 (25.00 %), en riesgo');
  });
});
