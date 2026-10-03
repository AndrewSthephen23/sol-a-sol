import { describe, expect, it } from 'vitest';

import {
  type AnnualCurrency,
  annualSavingsText,
  barData,
  cellText,
  readYear,
} from './annual-model';

const TWELVE = (value: string | null) => Array.from({ length: 12 }, () => value);

function soles(): AnnualCurrency {
  const months = [...TWELVE('0.00').slice(0, 10), null, null];

  return {
    currency: 'PEN',
    rows: [
      { row: 'INCOME', months: ['3000.00', ...months.slice(1)], total: '3000.00' },
      { row: 'FIXED_EXPENSE', months, total: '0.00' },
      { row: 'VARIABLE_EXPENSE', months, total: '0.00' },
      { row: 'EXPENSE', months, total: '0.00' },
      { row: 'SAVING', months, total: '0.00' },
      { row: 'INVESTMENT', months, total: '0.00' },
      { row: 'DEBT', months, total: '0.00' },
      { row: 'BALANCE', months: ['3000.00', ...months.slice(1)], total: '3000.00' },
    ],
    savingsRate: '0',
    distribution: [],
  };
}

describe('annual model', () => {
  it('shows a month that has not come as a dash, not a zero', () => {
    expect(cellText(null, 'PEN')).toBe('—');
    expect(cellText('0.00', 'PEN')).toBe('S/ 0.00');
    expect(cellText('-1234.5', 'USD')).toBe('-US$ 1,234.50');
  });

  it.each([
    ['2025', 2025],
    ['2026', 2026],
    ['2027', 2026],
    ['1999', 2026],
    ['26', 2026],
    [null, 2026],
  ])('reads the year %s from the URL as %s', (text, year) => {
    expect(readYear(text, 2026)).toBe(year);
  });

  it('says the savings rate of the year, or that there was no income', () => {
    expect(annualSavingsText(2026, '15.2')).toBe('En 2026 ahorraste el 15.20 % de lo que ganaste');
    expect(annualSavingsText(2025, null)).toBe('En 2025 no hubo ingresos');
  });

  it('draws a bar per month and series, none for a month that has not come', () => {
    const [january, , , , , , , , , , november] = barData(soles());

    expect(january).toMatchObject({
      month: 'Ene',
      INCOME: 3000,
      INCOME_label: 'S/ 3,000.00',
      EXPENSE: 0,
      SAVING: 0,
      INVESTMENT: 0,
    });
    expect(november).toMatchObject({ month: 'Nov', INCOME: null, INCOME_label: null });
  });
});
