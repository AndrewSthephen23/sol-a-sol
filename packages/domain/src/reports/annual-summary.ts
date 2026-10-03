import type { Decimal } from 'decimal.js';

import { FIRST_YEAR, LAST_YEAR } from '../budgeting/budget-policy.js';
import { CURRENCIES, type Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import { type TransactionType } from '../transactions/transaction-policy.js';
import { totalsByCurrency, type TransactionTotals } from '../transactions/transaction-totals.js';
import {
  type CategoryAmount,
  type CategorySlice,
  type DayAmount,
  expenseDistribution,
} from './monthly-dashboard.js';

/**
 * El año mes a mes (sección 2.8 del plan), decidido con el autor el 2026-10-03
 * (`docs/modules/reports.md`): cuánto entró, se gastó, se ahorró y se invirtió cada mes, con sus
 * totales y la tasa de ahorro del año. Nada se guarda: se calcula al consultar, por moneda y sin
 * convertir nunca.
 */

/**
 * Las filas del año, en orden (decisión 17): cada tipo en la suya, más el gasto total (fijo +
 * variable) y el saldo (lo que entró menos todo lo demás).
 */
export const ANNUAL_ROWS = [
  'INCOME',
  'FIXED_EXPENSE',
  'VARIABLE_EXPENSE',
  'EXPENSE',
  'SAVING',
  'INVESTMENT',
  'DEBT',
  'BALANCE',
] as const;

export type AnnualRowKind = (typeof ANNUAL_ROWS)[number];

const MONTHS = 12;

export class SummaryYearInvalidError extends DomainError {
  readonly code = 'SUMMARY_YEAR_INVALID';

  constructor(year: number) {
    super(
      `A summary is of a year between ${String(FIRST_YEAR)} and ${String(LAST_YEAR)}: got ${String(year)}.`,
    );
  }
}

export class SummaryYearInFutureError extends DomainError {
  readonly code = 'SUMMARY_YEAR_IN_FUTURE';

  constructor(year: number) {
    super(`There is no summary of ${String(year)} yet: it has not started.`);
  }
}

/**
 * Qué días mira el resumen de un año: el año entero si ya cerró; del 1 de enero a hoy si está en
 * curso. Un año que no empezó no tiene resumen, como un mes (2026-10-03).
 */
export function annualSummaryPeriod(
  year: number,
  today: LocalDate,
): { from: LocalDate; to: LocalDate } {
  if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
    throw new SummaryYearInvalidError(year);
  }
  const from = LocalDate.of(year, 1, 1);
  if (from.isAfter(today)) throw new SummaryYearInFutureError(year);
  const last = LocalDate.of(year, MONTHS, 31);

  return { from, to: today.isBefore(last) ? today : last };
}

export interface AnnualSummaryInput {
  year: number;
  today: LocalDate;
  /** Lo del año por día, tipo y moneda (sin transferencias ni borradas). */
  byDay: readonly Omit<DayAmount, 'count'>[];
  /** Lo del año por categoría **madre** (sus hijas ya sumadas), para la dona. */
  byCategory: readonly CategoryAmount[];
}

export interface AnnualRow {
  row: AnnualRowKind;
  /** Enero a diciembre. `null`: un mes que todavía no llega (decisión 16), no un cero. */
  months: (Money | null)[];
  /** El año hasta hoy. */
  total: Money;
}

export interface AnnualCurrencySummary {
  currency: Currency;
  rows: AnnualRow[];
  /** Ahorro (con inversión) sobre ingresos del año, sin redondear; `null` = sin ingresos. */
  savingsRate: Decimal | null;
  /** El gasto del año por categoría madre, como la dona del dashboard. */
  distribution: CategorySlice[];
}

export interface AnnualSummary {
  year: number;
  /** Las monedas con movimientos en el año, primero los soles. */
  currencies: AnnualCurrencySummary[];
}

/**
 * El resumen del año: una matriz fila × mes por moneda, con las mismas reglas que el resto del
 * producto (`totalsByCurrency`: gasto = fijo + variable, ahorro = ahorro + inversión, saldo =
 * ingresos menos todo lo demás).
 */
export function computeAnnualSummary(input: AnnualSummaryInput): AnnualSummary {
  const { year, today } = input;
  const inYear = input.byDay.filter((entry) => entry.date.year === year);

  return {
    year,
    currencies: CURRENCIES.flatMap((currency): AnnualCurrencySummary[] => {
      const entries = inYear.filter((entry) => entry.amount.currency === currency);
      if (entries.length === 0) return [];
      const zero = Money.zero(currency);
      // Enero a diciembre: lo de cada mes, o `null` si todavía no llega.
      const months = Array.from({ length: MONTHS }, (_, index) =>
        LocalDate.of(year, index + 1, 1).isAfter(today)
          ? null
          : entries.filter((entry) => entry.date.month === index + 1),
      );
      const row = (kind: AnnualRowKind, sum: (list: readonly YearEntry[]) => Money): AnnualRow => ({
        row: kind,
        months: months.map((list) => (list === null ? null : sum(list))),
        total: sum(entries),
      });
      const ofType = (type: TransactionType) => (list: readonly YearEntry[]) =>
        list
          .filter((entry) => entry.type === type)
          .reduce((total, entry) => total.add(entry.amount), zero);
      const totalsOf = (list: readonly YearEntry[]): TransactionTotals =>
        totalsByCurrency(list.map((entry) => ({ ...entry, count: 1 })))[0] ?? emptyTotals(zero);
      const totals = totalsOf(entries);

      return [
        {
          currency,
          rows: [
            row('INCOME', ofType('INCOME')),
            row('FIXED_EXPENSE', ofType('FIXED_EXPENSE')),
            row('VARIABLE_EXPENSE', ofType('VARIABLE_EXPENSE')),
            row('EXPENSE', (list) => totalsOf(list).expense),
            row('SAVING', ofType('SAVING')),
            row('INVESTMENT', ofType('INVESTMENT')),
            row('DEBT', ofType('DEBT')),
            row('BALANCE', (list) => totalsOf(list).balance),
          ],
          savingsRate: totals.saving.percentageOf(totals.income),
          distribution: expenseDistribution(
            input.byCategory.filter((entry) => entry.amount.currency === currency),
            currency,
            totals.expense,
          ),
        },
      ];
    }),
  };
}

type YearEntry = AnnualSummaryInput['byDay'][number];

/** Un mes sin movimientos en la moneda: todo en cero. */
function emptyTotals(zero: Money): TransactionTotals {
  return {
    currency: zero.currency,
    income: zero,
    expense: zero,
    saving: zero,
    debt: zero,
    balance: zero,
    count: 0,
  };
}
