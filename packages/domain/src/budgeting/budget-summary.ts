import { CURRENCIES, type Currency } from '../currency/currency.js';
import { Money } from '../money/money.js';
import { TRANSACTION_TYPES, type TransactionType } from '../transactions/transaction-policy.js';
import { type BudgetVariance, computeBudgetVariance } from './budget-policy.js';

/** Una partida del mes: cuánto se planea para una categoría madre, en una moneda. */
export interface BudgetedAmount {
  categoryId: string;
  type: TransactionType;
  planned: Money;
}

/**
 * Lo real de una categoría **madre** en una moneda: lo suyo más lo de sus hijas, ya sumado por
 * quien consulta las transacciones (decisión 2 de H4). Sin transferencias ni borradas.
 */
export interface RealAmount {
  categoryId: string;
  type: TransactionType;
  amount: Money;
}

export type BudgetLineReport = BudgetVariance & { categoryId: string; type: TransactionType };

export interface UnbudgetedAmount {
  categoryId: string;
  amount: Money;
}

/** El presupuesto de un tipo en una moneda: sus partidas, lo gastado sin partida y el total. */
export interface BudgetTypeReport {
  type: TransactionType;
  currency: Currency;
  lines: BudgetLineReport[];
  /** Lo real de categorías sin partida, de mayor a menor: la fila «Sin presupuesto» (decisión 5). */
  unbudgeted: UnbudgetedAmount[];
  /** Lo planeado de las partidas contra **todo** lo real del tipo, incluido lo sin presupuesto. */
  total: BudgetVariance;
}

/**
 * Presupuestado contra real del mes, por tipo y moneda, sin convertir nunca. Solo aparecen los
 * tipos y monedas con partidas o con movimientos, en el orden del glosario y primero los soles.
 */
export function summarizeBudget(
  lines: readonly BudgetedAmount[],
  actuals: readonly RealAmount[],
): BudgetTypeReport[] {
  return TRANSACTION_TYPES.flatMap((type) =>
    CURRENCIES.flatMap((currency): BudgetTypeReport[] => {
      const planned = lines.filter(
        (entry) => entry.type === type && entry.planned.currency === currency,
      );
      const real = actuals.filter(
        (entry) => entry.type === type && entry.amount.currency === currency,
      );
      if (planned.length === 0 && real.length === 0) return [];

      const zero = Money.zero(currency);
      const realOf = (categoryId: string) =>
        real
          .filter((entry) => entry.categoryId === categoryId)
          .reduce((total, entry) => total.add(entry.amount), zero);

      const reports = planned.map((entry): BudgetLineReport => ({
        categoryId: entry.categoryId,
        type,
        ...computeBudgetVariance(type, entry.planned, realOf(entry.categoryId)),
      }));

      const budgeted = new Set(planned.map((entry) => entry.categoryId));
      const unbudgeted = [...new Set(real.map((entry) => entry.categoryId))]
        .filter((categoryId) => !budgeted.has(categoryId))
        .map((categoryId) => ({ categoryId, amount: realOf(categoryId) }))
        .sort(
          (a, b) =>
            b.amount.subtract(a.amount).amount.comparedTo(0) ||
            a.categoryId.localeCompare(b.categoryId),
        );

      const totalPlanned = planned.reduce((total, entry) => total.add(entry.planned), zero);
      const totalReal = real.reduce((total, entry) => total.add(entry.amount), zero);

      return [
        {
          type,
          currency,
          lines: reports,
          unbudgeted,
          total: computeBudgetVariance(type, totalPlanned, totalReal),
        },
      ];
    }),
  );
}
