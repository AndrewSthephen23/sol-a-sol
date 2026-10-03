import type { Comparison, Money } from '@sol-a-sol/domain';

import type { MonthlySummaryView } from '../application/monthly-summary.js';

interface MoneyResponse {
  amount: string;
  currency: string;
}

interface ComparisonResponse {
  amount: string;
  previous: string;
  difference: string;
  /** Sin redondear; `null` si antes fue cero. */
  change: string | null;
}

/**
 * Lo que viaja: montos como **string decimal** y porcentajes como string **sin redondear**. Las
 * secciones de un módulo apagado no vienen.
 */
export interface MonthlySummaryResponse {
  year: number;
  month: number;
  period: { from: string; to: string; complete: boolean };
  previousPeriod: { from: string; to: string };
  currencies: {
    currency: string;
    totals: { income: string; expense: string; saving: string; debt: string; balance: string };
    savingsRate: string | null;
    byType: (ComparisonResponse & { type: string })[];
    byCategory: (ComparisonResponse & { categoryId: string; type: string })[];
    topCategories: { categoryId: string; amount: string; share: string | null }[];
    topMerchants: { merchant: string; amount: string; count: number }[];
  }[];
  budget?:
    | { status: 'NONE' }
    | {
        status: 'SET';
        currencies: {
          currency: string;
          planned: string;
          actual: string;
          executed: string | null;
        }[];
        exceeded: {
          categoryId: string;
          type: string;
          currency: string;
          planned: string;
          actual: string;
          difference: string;
          executed: string | null;
        }[];
      };
  cards?: {
    id: string;
    alias: string;
    institution: string | null;
    last4: string | null;
    charges: MoneyResponse[];
    statement: {
      closingDate: string;
      dueDate: string;
      balances: { currency: string; balance: string; remaining: string }[];
    } | null;
  }[];
  goals?: {
    id: string;
    name: string;
    currency: string;
    contributed: string;
    saved: string;
    remaining: string;
    percentage: string;
    suggestedMonthly: string | null;
    status: string;
  }[];
}

function moneyOf(money: Money): MoneyResponse {
  return { amount: money.toFixed(), currency: money.currency };
}

function comparisonOf(entry: Comparison): ComparisonResponse {
  return {
    amount: entry.amount.toFixed(),
    previous: entry.previous.toFixed(),
    difference: entry.difference.toFixed(),
    change: entry.change?.toString() ?? null,
  };
}

export function monthlySummaryResponse(view: MonthlySummaryView): MonthlySummaryResponse {
  const { periods, summary } = view;

  return {
    year: periods.year,
    month: periods.month,
    period: {
      from: periods.current.from.toString(),
      to: periods.current.to.toString(),
      complete: periods.complete,
    },
    previousPeriod: {
      from: periods.previous.from.toString(),
      to: periods.previous.to.toString(),
    },
    currencies: summary.currencies.map((entry) => ({
      currency: entry.currency,
      totals: {
        income: entry.totals.income.toFixed(),
        expense: entry.totals.expense.toFixed(),
        saving: entry.totals.saving.toFixed(),
        debt: entry.totals.debt.toFixed(),
        balance: entry.totals.balance.toFixed(),
      },
      savingsRate: entry.savingsRate?.toString() ?? null,
      byType: entry.byType.map((row) => ({ type: row.type, ...comparisonOf(row) })),
      byCategory: entry.byCategory.map((row) => ({
        categoryId: row.categoryId,
        type: row.type,
        ...comparisonOf(row),
      })),
      topCategories: entry.topCategories.map((row) => ({
        categoryId: row.categoryId,
        amount: row.amount.toFixed(),
        share: row.share?.toString() ?? null,
      })),
      topMerchants: entry.topMerchants.map((row) => ({
        merchant: row.merchant,
        amount: row.amount.toFixed(),
        count: row.count,
      })),
    })),
    ...(summary.budget === undefined
      ? {}
      : {
          budget:
            summary.budget.status === 'NONE'
              ? { status: 'NONE' as const }
              : {
                  status: 'SET' as const,
                  currencies: summary.budget.currencies.map((row) => ({
                    currency: row.currency,
                    planned: row.planned.toFixed(),
                    actual: row.actual.toFixed(),
                    executed: row.executed?.toString() ?? null,
                  })),
                  exceeded: summary.budget.exceeded.map((line) => ({
                    categoryId: line.categoryId,
                    type: line.type,
                    currency: line.planned.currency,
                    planned: line.planned.toFixed(),
                    actual: line.actual.toFixed(),
                    difference: line.difference.toFixed(),
                    executed: line.executed?.toString() ?? null,
                  })),
                },
        }),
    ...(summary.cards === undefined
      ? {}
      : {
          cards: summary.cards.map((card) => {
            const label = view.cards.get(card.cardId);

            return {
              id: card.cardId,
              alias: label?.alias ?? '',
              institution: label?.institution ?? null,
              last4: label?.last4 ?? null,
              charges: card.charges.map(moneyOf),
              statement:
                card.statement === null
                  ? null
                  : {
                      closingDate: card.statement.closingDate.toString(),
                      dueDate: card.statement.dueDate.toString(),
                      balances: card.statement.balances.map((entry) => ({
                        currency: entry.balance.currency,
                        balance: entry.balance.toFixed(),
                        remaining: entry.remaining.toFixed(),
                      })),
                    },
            };
          }),
        }),
    ...(summary.goals === undefined
      ? {}
      : {
          goals: summary.goals.map((goal) => ({
            id: goal.goalId,
            name: view.goals.get(goal.goalId)?.name ?? '',
            currency: goal.contributed.currency,
            contributed: goal.contributed.toFixed(),
            saved: goal.progress.saved.toFixed(),
            remaining: goal.progress.remaining.toFixed(),
            percentage: goal.progress.percentage.toString(),
            suggestedMonthly: goal.progress.suggestedMonthly?.toFixed() ?? null,
            status: goal.progress.status,
          })),
        }),
  };
}
