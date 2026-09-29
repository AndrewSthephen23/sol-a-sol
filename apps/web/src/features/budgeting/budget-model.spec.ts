import { describe, expect, it } from 'vitest';

import {
  barWidth,
  budgetErrorMessage,
  checkDraft,
  draftFrom,
  executedText,
  isGoal,
  readPlannedAmount,
  varianceText,
} from './budget-model';

function variance(status: 'WITHIN' | 'EXCEEDED' | 'PENDING' | 'MET', difference: string) {
  return { planned: '0', actual: '0', difference, executed: null, status };
}

describe('varianceText', () => {
  it.each([
    [variance('WITHIN', '250.00'), 'Quedan S/ 250.00'],
    [variance('WITHIN', '0.00'), 'Quedan S/ 0.00'],
    [variance('EXCEEDED', '-45.00'), 'Te pasaste S/ 45.00'],
    [variance('PENDING', '-300.00'), 'Faltan S/ 300.00'],
    [variance('MET', '0.00'), 'Cumplida'],
    [variance('MET', '150.00'), 'Cumplida, S/ 150.00 de más'],
  ])('reads %j as %s', (entry, text) => {
    expect(varianceText(entry, 'PEN')).toBe(text);
  });

  it('writes dollars as dollars', () => {
    expect(varianceText(variance('WITHIN', '1234.50'), 'USD')).toBe('Quedan US$ 1,234.50');
  });
});

describe('executedText and barWidth', () => {
  it('shows the percentage with two decimals, half to even, and a dash without a budget', () => {
    expect(executedText('36.666666666666666667')).toBe('36.67 %');
    expect(executedText('18.8')).toBe('18.80 %');
    expect(executedText(null)).toBe('—');
  });

  it('fills the bar between empty and full, only to draw it', () => {
    expect(barWidth('18.8')).toBe(18.8);
    expect(barWidth('250')).toBe(100);
    expect(barWidth('-5')).toBe(0);
    expect(barWidth(null)).toBe(0);
  });
});

describe('isGoal', () => {
  it('reads income, saving and investment as goals, the rest as limits', () => {
    expect(['INCOME', 'SAVING', 'INVESTMENT'].map((type) => isGoal(type as never))).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      ['FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'DEBT'].map((type) => isGoal(type as never)),
    ).toEqual([false, false, false]);
  });
});

describe('readPlannedAmount', () => {
  it.each([
    ['800', '800.00'],
    ['1,234.5', '1234.50'],
    ['S/ 50', '50.00'],
    ['0', '0.00'],
    ['S/ 0', '0.00'],
  ])('reads %j as %s', (text, amount) => {
    expect(readPlannedAmount(text, 'PEN')).toEqual({ amount });
  });

  it.each([
    ['nothing', '', 'Escribe el monto'],
    ['a third decimal, never rounded', '800.005', 'hasta 2 decimales'],
    ['a decimal comma', '1.234,50', 'punto decimal'],
    ['a negative amount', '-1', 'no puede ser negativo'],
    ['another currency', 'US$ 20', 'en dólares, no en soles'],
  ])('rejects %s', (_case, text, message) => {
    const read = readPlannedAmount(text, 'PEN');

    expect('error' in read && read.error).toContain(message);
  });
});

describe('the draft', () => {
  const budget = {
    year: 2026,
    month: 9,
    lines: [
      {
        categoryId: 'food',
        type: 'VARIABLE_EXPENSE' as const,
        plannedAmount: '800.00',
        currency: 'PEN' as const,
      },
    ],
    summary: [],
  };

  it('starts from the saved lines, with the amounts as they came', () => {
    expect(draftFrom(budget)).toEqual([{ categoryId: 'food', currency: 'PEN', amount: '800.00' }]);
  });

  it('builds the lines to save, as text', () => {
    expect(
      checkDraft([
        { categoryId: 'food', currency: 'PEN', amount: '900' },
        { categoryId: 'food', currency: 'USD', amount: '0' },
      ]),
    ).toEqual({
      lines: [
        { categoryId: 'food', currency: 'PEN', plannedAmount: '900.00' },
        { categoryId: 'food', currency: 'USD', plannedAmount: '0.00' },
      ],
    });
  });

  it('says which line is wrong, by category and currency', () => {
    expect(checkDraft([{ categoryId: 'food', currency: 'USD', amount: 'mucho' }])).toEqual({
      errors: {
        'food|USD': 'Escribe el monto con punto decimal y hasta 2 decimales, como 800.00.',
      },
    });
  });
});

describe('budgetErrorMessage', () => {
  it('translates what the API can refuse, and knows nothing else', () => {
    expect(budgetErrorMessage('BUDGET_CATEGORY_NOT_TOP_LEVEL')).toContain('categorías principales');
    expect(budgetErrorMessage('SOMETHING_NEW')).toBeNull();
    expect(budgetErrorMessage(null)).toBeNull();
  });
});
