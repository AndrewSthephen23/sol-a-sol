import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  ArchivedCategoryError,
  assertCategoryUsable,
  assertTransactionAmount,
  assertTransactionDate,
  CategoryTypeMismatchError,
  countsAsExpense,
  countsAsSaving,
  FutureTransactionDateError,
  NonPositiveTransactionAmountError,
  resolveTransactionCurrency,
  signedAmount,
  TRANSACTION_SOURCES,
  TRANSACTION_TYPES,
  TransactionCurrencyRequiredError,
} from './transaction-policy.js';

describe('transaction types and sources', () => {
  it('are the ones of the glossary, in English', () => {
    expect(TRANSACTION_TYPES).toEqual([
      'INCOME',
      'FIXED_EXPENSE',
      'VARIABLE_EXPENSE',
      'SAVING',
      'INVESTMENT',
      'DEBT',
    ]);
    expect(TRANSACTION_SOURCES).toEqual(['MANUAL', 'IOS_SHORTCUT', 'ANDROID_AUTOMATION', 'IMPORT']);
  });
});

describe('assertTransactionAmount', () => {
  it('accepts a positive amount, down to one cent', () => {
    expect(() => {
      assertTransactionAmount(Money.of('0.01', 'PEN'));
    }).not.toThrow();
  });

  // El signo lo da el tipo: un gasto de S/ 25 se registra como 25, no como -25.
  it.each(['0', '0.00', '-25.90'])('rejects %s: the type gives the sign', (amount) => {
    expect(() => {
      assertTransactionAmount(Money.of(amount, 'PEN'));
    }).toThrow(NonPositiveTransactionAmountError);
  });
});

describe('signedAmount', () => {
  it('keeps an income positive', () => {
    expect(signedAmount('INCOME', Money.of('3500.00', 'PEN'))).toEqual(Money.of('3500.00', 'PEN'));
  });

  // Para el saldo del mes, todo lo que no es ingreso sale de lo disponible.
  it.each(['FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'SAVING', 'INVESTMENT', 'DEBT'] as const)(
    'makes %s negative, in the same currency',
    (type) => {
      expect(signedAmount(type, Money.of('25.90', 'USD'))).toEqual(Money.of('-25.90', 'USD'));
    },
  );
});

describe('what each type counts as', () => {
  it('counts only fixed and variable expenses as expense', () => {
    expect(TRANSACTION_TYPES.filter(countsAsExpense)).toEqual([
      'FIXED_EXPENSE',
      'VARIABLE_EXPENSE',
    ]);
  });

  // La tasa de ahorro es (ahorro + inversión) / ingresos: plata que no se consume.
  it('counts saving and investment as saving', () => {
    expect(TRANSACTION_TYPES.filter(countsAsSaving)).toEqual(['SAVING', 'INVESTMENT']);
  });
});

describe('assertTransactionDate', () => {
  const today = LocalDate.of(2026, 9, 24);

  it.each([
    ['today', () => today],
    ['yesterday', () => today.plusDays(-1)],
    ['a year ago', () => LocalDate.of(2025, 9, 24)],
  ])('accepts %s', (_case, date) => {
    expect(() => {
      assertTransactionDate(date(), today);
    }).not.toThrow();
  });

  // Un pago programado se registra el día que ocurre: el resumen no muestra plata que no se movió.
  it('rejects tomorrow', () => {
    expect(() => {
      assertTransactionDate(today.plusDays(1), today);
    }).toThrow(FutureTransactionDateError);
  });
});

describe('resolveTransactionCurrency', () => {
  it('uses the currency that was sent, even if the method has another', () => {
    expect(resolveTransactionCurrency('USD', 'PEN')).toBe('USD');
  });

  it("falls back to the payment method's currency", () => {
    expect(resolveTransactionCurrency(null, 'PEN')).toBe('PEN');
  });

  // El dominio no supone soles: un gasto en US$ guardado como S/ es un error difícil de ver.
  it('asks for it when neither says, instead of assuming soles', () => {
    expect(() => resolveTransactionCurrency(null, null)).toThrow(TransactionCurrencyRequiredError);
  });
});

describe('assertCategoryUsable', () => {
  it('accepts an active category of the same type', () => {
    expect(() => {
      assertCategoryUsable({ type: 'VARIABLE_EXPENSE', archived: false }, 'VARIABLE_EXPENSE');
    }).not.toThrow();
  });

  it('rejects an income in an expense category', () => {
    expect(() => {
      assertCategoryUsable({ type: 'VARIABLE_EXPENSE', archived: false }, 'INCOME');
    }).toThrow(CategoryTypeMismatchError);
  });

  // Una archivada sigue en las transacciones viejas, pero no se ofrece para las nuevas.
  it('rejects an archived category', () => {
    expect(() => {
      assertCategoryUsable({ type: 'SAVING', archived: true }, 'SAVING');
    }).toThrow(ArchivedCategoryError);
  });
});

describe('errors', () => {
  it.each([
    [
      'NonPositiveTransactionAmountError',
      () => new NonPositiveTransactionAmountError(),
      'TRANSACTION_AMOUNT_NOT_POSITIVE',
      /greater than zero/,
    ],
    [
      'FutureTransactionDateError',
      () => new FutureTransactionDateError(LocalDate.of(2026, 9, 25)),
      'TRANSACTION_DATE_IN_FUTURE',
      /2026-09-25 is in the future/,
    ],
    [
      'TransactionCurrencyRequiredError',
      () => new TransactionCurrencyRequiredError(),
      'TRANSACTION_CURRENCY_REQUIRED',
      /currency is required/,
    ],
    [
      'CategoryTypeMismatchError',
      () => new CategoryTypeMismatchError('VARIABLE_EXPENSE', 'INCOME'),
      'CATEGORY_TYPE_MISMATCH',
      /VARIABLE_EXPENSE category .* INCOME transaction/,
    ],
    ['ArchivedCategoryError', () => new ArchivedCategoryError(), 'CATEGORY_ARCHIVED', /archived/],
  ])('%s has a stable code and says which rule broke', (name, build, code, message) => {
    const error = build();

    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.name).toBe(name);
  });
});
