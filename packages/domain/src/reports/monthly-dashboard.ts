import type { Decimal } from 'decimal.js';

import { CURRENCIES, type Currency } from '../currency/currency.js';
import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  countsAsExpense,
  TRANSACTION_TYPES,
  type TransactionType,
} from '../transactions/transaction-policy.js';
import { totalsByCurrency } from '../transactions/transaction-totals.js';

/** Porciones de la dona antes de juntar el resto en «Otras» (decisión 9 de H4, 2026-09-29). */
export const DISTRIBUTION_SLICES = 6;

/** Lo de una categoría **madre** en un tipo y una moneda: sus hijas ya sumadas por quien llama. */
export interface CategoryAmount {
  categoryId: string;
  type: TransactionType;
  amount: Money;
}

/** Lo de un día en un tipo y una moneda. */
export interface DayAmount {
  date: LocalDate;
  type: TransactionType;
  amount: Money;
}

export interface MonthlyDashboardInput {
  year: number;
  month: number;
  /** Hoy en Lima: el mes en curso se dibuja hasta hoy, y un mes que no empezó no tiene barras. */
  today: LocalDate;
  byCategory: readonly CategoryAmount[];
  byDay: readonly DayAmount[];
}

export interface DailyExpense {
  date: LocalDate;
  /** Gasto fijo + variable de ese día; cero si no hubo. */
  amount: Money;
}

export interface CategorySlice {
  /** `null` es «Otras»: todo lo que no entra en las primeras porciones. */
  categoryId: string | null;
  amount: Money;
  /** Parte del gasto del mes, en %, sin redondear. */
  share: Decimal | null;
}

export interface TypeTable {
  type: TransactionType;
  total: Money;
  /** De mayor a menor. */
  categories: { categoryId: string; amount: Money }[];
}

/** El tablero del mes en una moneda. */
export interface CurrencyDashboard {
  currency: Currency;
  kpis: { income: Money; expense: Money; saving: Money; debt: Money; balance: Money };
  /** Una barra por día (decisión 8): gasto fijo + variable, con los días sin gasto en cero. */
  daily: DailyExpense[];
  /** La dona del gasto por categoría madre (decisión 9). */
  distribution: CategorySlice[];
  byType: TypeTable[];
}

/** De mayor a menor y, empatados, por categoría: así el orden nunca salta. */
export function biggestFirst(a: { categoryId: string; amount: Money }, b: typeof a): number {
  return (
    b.amount.subtract(a.amount).amount.comparedTo(0) || a.categoryId.localeCompare(b.categoryId)
  );
}

/** Suma por categoría, en una moneda. */
export function sumByCategory(entries: readonly CategoryAmount[], currency: Currency) {
  const sums = new Map<string, Money>();
  for (const entry of entries) {
    sums.set(
      entry.categoryId,
      (sums.get(entry.categoryId) ?? Money.zero(currency)).add(entry.amount),
    );
  }

  return [...sums].map(([categoryId, amount]) => ({ categoryId, amount })).sort(biggestFirst);
}

/** Los días del mes que ya pasaron: todos en un mes pasado, hasta hoy en el actual, ninguno en uno futuro. */
function daysToDraw(year: number, month: number, today: LocalDate): LocalDate[] {
  const first = LocalDate.of(year, month, 1);
  const last = first.lastDayOfMonth();
  const until = today.isBefore(last) ? today : last;
  const days: LocalDate[] = [];
  for (let date = first; !date.isAfter(until); date = date.plusDays(1)) days.push(date);

  return days;
}

/**
 * El dashboard del mes (sección 2.4 del plan), **por moneda**, sin convertir nunca: KPIs, gasto
 * diario, dona por categoría y tablas por tipo. Qué es gasto, ahorro y saldo sale de las mismas
 * reglas que el resto del producto (`totalsByCurrency`, `countsAsExpense`). Solo aparecen las
 * monedas con movimientos, primero los soles.
 */
export function buildMonthlyDashboard({
  year,
  month,
  today,
  byCategory,
  byDay,
}: MonthlyDashboardInput): CurrencyDashboard[] {
  const days = daysToDraw(year, month, today);

  return CURRENCIES.flatMap((currency): CurrencyDashboard[] => {
    const entries = byCategory.filter((entry) => entry.amount.currency === currency);
    const [totals] = totalsByCurrency(entries.map((entry) => ({ ...entry, count: 1 })));
    if (totals === undefined) return [];

    const spentByDay = new Map<string, Money>();
    for (const entry of byDay) {
      if (entry.amount.currency !== currency || !countsAsExpense(entry.type)) continue;
      const key = entry.date.toString();
      spentByDay.set(key, (spentByDay.get(key) ?? Money.zero(currency)).add(entry.amount));
    }

    const expenses = sumByCategory(
      entries.filter((entry) => countsAsExpense(entry.type)),
      currency,
    );
    const shown = expenses.slice(0, DISTRIBUTION_SLICES);
    const rest = expenses
      .slice(DISTRIBUTION_SLICES)
      .reduce((total, entry) => total.add(entry.amount), Money.zero(currency));
    const slices: { categoryId: string | null; amount: Money }[] =
      expenses.length > DISTRIBUTION_SLICES
        ? [...shown, { categoryId: null, amount: rest }]
        : shown;

    return [
      {
        currency,
        kpis: {
          income: totals.income,
          expense: totals.expense,
          saving: totals.saving,
          debt: totals.debt,
          balance: totals.balance,
        },
        daily: days.map((date) => ({
          date,
          amount: spentByDay.get(date.toString()) ?? Money.zero(currency),
        })),
        distribution: slices.map((slice) => ({
          ...slice,
          share: slice.amount.percentageOf(totals.expense),
        })),
        byType: TRANSACTION_TYPES.flatMap((type): TypeTable[] => {
          const categories = sumByCategory(
            entries.filter((entry) => entry.type === type),
            currency,
          );
          if (categories.length === 0) return [];

          return [
            {
              type,
              total: categories.reduce((total, row) => total.add(row.amount), Money.zero(currency)),
              categories,
            },
          ];
        }),
      },
    ];
  });
}
