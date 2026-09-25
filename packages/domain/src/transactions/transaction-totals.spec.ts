import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import type { TransactionType } from './transaction-policy.js';
import { totalsByCurrency } from './transaction-totals.js';

function entry(type: TransactionType, amount: string, currency: 'PEN' | 'USD' = 'PEN') {
  return { type, amount: Money.of(amount, currency) };
}

function plain(totals: ReturnType<typeof totalsByCurrency>) {
  return totals.map((total) => ({
    currency: total.currency,
    income: total.income.toFixed(),
    expense: total.expense.toFixed(),
    saving: total.saving.toFixed(),
    debt: total.debt.toFixed(),
    balance: total.balance.toFixed(),
  }));
}

describe('totalsByCurrency', () => {
  it('is empty without transactions', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });

  it('adds up each group following the rules of what is expense and saving', () => {
    const totals = totalsByCurrency([
      entry('INCOME', '4000.00'),
      entry('FIXED_EXPENSE', '1200.00'),
      entry('VARIABLE_EXPENSE', '300.50'),
      entry('SAVING', '400.00'),
      entry('INVESTMENT', '200.00'),
      entry('DEBT', '300.00'),
    ]);

    expect(plain(totals)).toEqual([
      {
        currency: 'PEN',
        income: '4000.00',
        // Fijo + variable; la deuda va aparte.
        expense: '1500.50',
        // Ahorro + inversión.
        saving: '600.00',
        debt: '300.00',
        // Solo el ingreso suma: 4000 − 1500.50 − 600 − 300.
        balance: '1599.50',
      },
    ]);
  });

  it('adds several entries of the same type', () => {
    const totals = totalsByCurrency([entry('INCOME', '0.10'), entry('INCOME', '0.20')]);

    expect(plain(totals)[0]).toMatchObject({ income: '0.30', balance: '0.30' });
  });

  it('gives zero to the groups without movements', () => {
    expect(plain(totalsByCurrency([entry('VARIABLE_EXPENSE', '25.90')]))).toEqual([
      {
        currency: 'PEN',
        income: '0.00',
        expense: '25.90',
        saving: '0.00',
        debt: '0.00',
        balance: '-25.90',
      },
    ]);
  });

  // Nunca se convierte: cada moneda tiene sus propios totales.
  it('keeps each currency apart, soles first', () => {
    const totals = totalsByCurrency([
      entry('VARIABLE_EXPENSE', '20.00', 'USD'),
      entry('INCOME', '100.00', 'PEN'),
    ]);

    expect(plain(totals)).toEqual([
      {
        currency: 'PEN',
        income: '100.00',
        expense: '0.00',
        saving: '0.00',
        debt: '0.00',
        balance: '100.00',
      },
      {
        currency: 'USD',
        income: '0.00',
        expense: '20.00',
        saving: '0.00',
        debt: '0.00',
        balance: '-20.00',
      },
    ]);
  });

  it('leaves out a currency without movements', () => {
    expect(totalsByCurrency([entry('INCOME', '1.00', 'USD')]).map((t) => t.currency)).toEqual([
      'USD',
    ]);
  });

  it('keeps each total in its currency', () => {
    const [usd] = totalsByCurrency([entry('SAVING', '5.00', 'USD')]);

    for (const money of [usd?.income, usd?.expense, usd?.saving, usd?.debt, usd?.balance]) {
      expect(money?.currency).toBe('USD');
    }
  });
});
