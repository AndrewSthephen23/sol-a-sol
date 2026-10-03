import type { Decimal } from 'decimal.js';

import { budgetKind } from '../budgeting/budget-policy.js';
import {
  type BudgetedAmount,
  type BudgetLineReport,
  summarizeBudget,
} from '../budgeting/budget-summary.js';
import { CURRENCIES, type Currency } from '../currency/currency.js';
import { DomainError } from '../errors/domain-error.js';
import {
  computeGoalProgress,
  type GoalMovement,
  type GoalProgress,
} from '../goals/goal-progress.js';
import { Money } from '../money/money.js';
import { searchKey } from '../text/search-key.js';
import { LocalDate } from '../time/local-date.js';
import {
  countsAsExpense,
  TRANSACTION_TYPES,
  type TransactionType,
} from '../transactions/transaction-policy.js';
import { totalsByCurrency, type TransactionTotals } from '../transactions/transaction-totals.js';
import { biggestFirst, type CategoryAmount, sumByCategory } from './monthly-dashboard.js';

/**
 * El cierre de un mes (sección 2.7 del plan), decidido con el autor el 2026-10-03
 * (`docs/modules/reports.md`). El dashboard sigue el mes día a día; el resumen lo **evalúa**: qué
 * entró y salió, cuánto se ahorró, cómo cambió contra el mes anterior, en qué se gastó más, cómo
 * fue el presupuesto, qué hay que pagar de las tarjetas y cómo van las metas. Nada se guarda: se
 * calcula al consultar, por moneda y sin convertir nunca.
 */

/** Cuántas categorías y comercios entran en cada top (plan, sección 2.7). */
export const TOP_ITEMS = 5;

export class SummaryMonthInFutureError extends DomainError {
  readonly code = 'SUMMARY_MONTH_IN_FUTURE';

  constructor(year: number, month: number) {
    super(
      `There is no summary of ${String(year)}-${String(month).padStart(2, '0')} yet: it has not started.`,
    );
  }
}

export interface SummaryPeriod {
  from: LocalDate;
  /** Incluido. */
  to: LocalDate;
}

export interface MonthlySummaryPeriods {
  year: number;
  month: number;
  /** El mes entero si ya cerró; del 1 a hoy si está en curso. `to` es la fecha de corte. */
  current: SummaryPeriod;
  /** Con qué se compara: el mes anterior entero, o hasta el mismo día si el mes está en curso. */
  previous: SummaryPeriod;
  /** El mes ya terminó: el resumen no va a cambiar (salvo correcciones). */
  complete: boolean;
}

/**
 * Qué días mira el resumen de un mes. Un mes en curso se compara con el anterior **hasta el mismo
 * día** (decisión 8): del 1 al 15 de setiembre contra del 1 al 15 de agosto; si el anterior no
 * tiene ese día, hasta su último día. Un mes que no empezó no tiene resumen (2026-10-03).
 */
export function monthlySummaryPeriods(
  year: number,
  month: number,
  today: LocalDate,
): MonthlySummaryPeriods {
  const first = LocalDate.of(year, month, 1);
  if (first.isAfter(today)) throw new SummaryMonthInFutureError(year, month);
  const last = first.lastDayOfMonth();
  const previousFirst = first.plusMonths(-1);
  const complete = today.isAfter(last);

  return {
    year,
    month,
    current: { from: first, to: complete ? last : today },
    previous: {
      from: previousFirst,
      to: complete ? previousFirst.lastDayOfMonth() : today.plusMonths(-1),
    },
    complete,
  };
}

/** Lo gastado en un comercio, tal como se escribió, en un tipo y una moneda. */
export interface MerchantAmount {
  merchant: string;
  type: TransactionType;
  amount: Money;
  /** Cuántas transacciones suma `amount`. */
  count: number;
}

/** Un estado de cuenta que cerró en el mes, ya calculado (`computeCardStatus`). */
export interface SummaryStatement {
  closingDate: LocalDate;
  dueDate: LocalDate;
  /** Uno por moneda de la tarjeta: la deuda al corte y lo que falta pagar a la fecha de corte. */
  balances: { balance: Money; remaining: Money }[];
}

export interface SummaryCardInput {
  cardId: string;
  archived: boolean;
  /** Lo cargado a la tarjeta en el mes calendario, por moneda (decisión 13). */
  charges: Money[];
  /** Los que cerraron en el mes; solo queda el que vence el mes siguiente. */
  statements: SummaryStatement[];
}

export interface SummaryGoalInput {
  goalId: string;
  archived: boolean;
  target: Money;
  startDate: LocalDate;
  endDate: LocalDate;
  /** Todos sus movimientos que cuentan (los enlazados, con su transacción de hoy). */
  contributions: readonly GoalMovement[];
}

export interface MonthlySummaryInput {
  periods: MonthlySummaryPeriods;
  /** Lo del periodo, por categoría **madre** (sus hijas ya sumadas) y por comercio. */
  current: { byCategory: readonly CategoryAmount[]; byMerchant: readonly MerchantAmount[] };
  /** Lo del periodo con que se compara. */
  previous: { byCategory: readonly CategoryAmount[] };
  /** Sin la clave: el módulo está apagado y la sección no aparece. */
  budget?: { lines: readonly BudgetedAmount[] };
  cards?: readonly SummaryCardInput[];
  goals?: readonly SummaryGoalInput[];
}

/** Ahora contra antes: la diferencia y su porcentaje, sin redondear; `null` con base cero. */
export interface Comparison {
  amount: Money;
  previous: Money;
  /** Ahora − antes. */
  difference: Money;
  /** La diferencia sobre lo de antes, en %. `null` si antes fue cero (decisión 10). */
  change: Decimal | null;
}

export type TypeComparison = Comparison & { type: TransactionType };
export type CategoryComparison = Comparison & { categoryId: string; type: TransactionType };

export interface TopCategory {
  categoryId: string;
  amount: Money;
  /** Parte del gasto del mes, en %, sin redondear. */
  share: Decimal | null;
}

export interface TopMerchant {
  /** Como se escribió más veces. */
  merchant: string;
  amount: Money;
  count: number;
}

export interface CurrencySummary {
  currency: Currency;
  totals: Omit<TransactionTotals, 'currency' | 'count'>;
  /** Los seis tipos, en el orden del glosario, aunque estén en cero. */
  byType: TypeComparison[];
  /** Ahorro (con inversión) sobre ingresos, en %, sin redondear. `null` = «sin ingresos». */
  savingsRate: Decimal | null;
  byCategory: CategoryComparison[];
  topCategories: TopCategory[];
  topMerchants: TopMerchant[];
}

export interface BudgetCurrencyExecution {
  currency: Currency;
  planned: Money;
  /** Todo lo real de los tipos con límite, también lo gastado sin partida. */
  actual: Money;
  executed: Decimal | null;
}

export type SummaryBudget =
  | { status: 'NONE' }
  | { status: 'SET'; currencies: BudgetCurrencyExecution[]; exceeded: BudgetLineReport[] };

export interface SummaryCard {
  cardId: string;
  charges: Money[];
  /** El estado que cerró en el mes y vence el siguiente; `null` si no hay. */
  statement: SummaryStatement | null;
}

export interface SummaryGoal {
  goalId: string;
  /** Aportes − retiros del periodo. */
  contributed: Money;
  /** A la fecha de corte del resumen. */
  progress: GoalProgress;
}

export interface MonthlySummary {
  /** Las monedas con movimientos en el mes o en el anterior, primero los soles. */
  currencies: CurrencySummary[];
  budget?: SummaryBudget;
  cards?: SummaryCard[];
  goals?: SummaryGoal[];
}

export function computeMonthlySummary(input: MonthlySummaryInput): MonthlySummary {
  const { periods, current, previous } = input;

  return {
    currencies: CURRENCIES.flatMap((currency) =>
      currencySummary(currency, current.byCategory, previous.byCategory, current.byMerchant),
    ),
    ...(input.budget === undefined
      ? {}
      : { budget: budgetSection(input.budget.lines, current.byCategory) }),
    ...(input.cards === undefined ? {} : { cards: cardsSection(input.cards, periods) }),
    ...(input.goals === undefined ? {} : { goals: goalsSection(input.goals, periods) }),
  };
}

function currencySummary(
  currency: Currency,
  allCurrent: readonly CategoryAmount[],
  allPrevious: readonly CategoryAmount[],
  allMerchants: readonly MerchantAmount[],
): CurrencySummary[] {
  const now = allCurrent.filter((entry) => entry.amount.currency === currency);
  const before = allPrevious.filter((entry) => entry.amount.currency === currency);
  if (now.length === 0 && before.length === 0) return [];
  const zero = Money.zero(currency);
  const [totals = emptyTotals(zero)] = totalsByCurrency(
    now.map((entry) => ({ ...entry, count: 1 })),
  );
  const sumOf = (entries: readonly CategoryAmount[], include: (entry: CategoryAmount) => boolean) =>
    entries.filter(include).reduce((total, entry) => total.add(entry.amount), zero);

  const expenses = sumByCategory(
    now.filter((entry) => countsAsExpense(entry.type)),
    currency,
  );

  return [
    {
      currency,
      totals: {
        income: totals.income,
        expense: totals.expense,
        saving: totals.saving,
        debt: totals.debt,
        balance: totals.balance,
      },
      byType: TRANSACTION_TYPES.map((type) => ({
        type,
        ...compare(
          sumOf(now, (entry) => entry.type === type),
          sumOf(before, (entry) => entry.type === type),
        ),
      })),
      savingsRate: totals.saving.percentageOf(totals.income),
      byCategory: categoryComparisons(now, before, currency),
      topCategories: expenses.slice(0, TOP_ITEMS).map((entry) => ({
        ...entry,
        share: entry.amount.percentageOf(totals.expense),
      })),
      topMerchants: topMerchants(
        allMerchants.filter((entry) => entry.amount.currency === currency),
        zero,
      ),
    },
  ];
}

/** Una moneda que solo se movió el mes anterior: este mes, todo en cero. */
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

function compare(amount: Money, previous: Money): Comparison {
  const difference = amount.subtract(previous);

  return { amount, previous, difference, change: difference.percentageOf(previous) };
}

/** Cada categoría madre de cualquiera de los dos meses: por tipo, de mayor a menor ahora, por id. */
function categoryComparisons(
  now: readonly CategoryAmount[],
  before: readonly CategoryAmount[],
  currency: Currency,
): CategoryComparison[] {
  return TRANSACTION_TYPES.flatMap((type) => {
    const nowByCategory = new Map(
      sumByCategory(
        now.filter((entry) => entry.type === type),
        currency,
      ).map((entry) => [entry.categoryId, entry.amount]),
    );
    const beforeByCategory = new Map(
      sumByCategory(
        before.filter((entry) => entry.type === type),
        currency,
      ).map((entry) => [entry.categoryId, entry.amount]),
    );
    const zero = Money.zero(currency);

    return [...new Set([...nowByCategory.keys(), ...beforeByCategory.keys()])]
      .map((categoryId) => ({ categoryId, amount: nowByCategory.get(categoryId) ?? zero }))
      .sort(biggestFirst)
      .map(({ categoryId, amount }) => ({
        categoryId,
        type,
        ...compare(amount, beforeByCategory.get(categoryId) ?? zero),
      }));
  });
}

/**
 * Los comercios donde más se **gastó** (fijo + variable), juntando los que solo difieren en
 * tildes, mayúsculas o espacios (`searchKey`, decisión 11). Se nombran como se escribieron más
 * veces; empatados, el primero en orden de código. Sin comercio, fuera.
 */
function topMerchants(entries: readonly MerchantAmount[], zero: Money): TopMerchant[] {
  const groups = new Map<
    string,
    { amount: Money; count: number; spellings: Map<string, number> }
  >();
  for (const entry of entries) {
    const key = searchKey(entry.merchant);
    if (key === '' || !countsAsExpense(entry.type)) continue;
    const group = groups.get(key) ?? {
      amount: zero,
      count: 0,
      spellings: new Map<string, number>(),
    };
    const spelling = entry.merchant.trim();
    group.amount = group.amount.add(entry.amount);
    group.count += entry.count;
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + entry.count);
    groups.set(key, group);
  }

  return [...groups]
    .map(([categoryId, group]) => ({ categoryId, ...group }))
    .sort(biggestFirst)
    .slice(0, TOP_ITEMS)
    .map((group) => ({
      merchant: mostWritten(group.spellings),
      amount: group.amount,
      count: group.count,
    }));
}

/** Hay al menos una forma de escribirlo: se agrupa al leer la primera. */
function mostWritten(spellings: ReadonlyMap<string, number>): string {
  const [name] = [...spellings].reduce((best, candidate) =>
    // Stryker disable next-line EqualityOperator: las formas son claves de un `Map`, así que nunca
    // hay dos iguales y `<` da lo mismo que `<=`.
    candidate[1] > best[1] || (candidate[1] === best[1] && candidate[0] < best[0])
      ? candidate
      : best,
  );

  return name;
}

/**
 * Solo las partidas **límite** (gasto fijo, variable y deuda), como `computeBudgetVariance`
 * (decisión 12): el % ejecutado por moneda y las partidas excedidas, la más excedida primero. Sin
 * partidas límite ese mes, «sin presupuesto».
 */
function budgetSection(
  lines: readonly BudgetedAmount[],
  actuals: readonly CategoryAmount[],
): SummaryBudget {
  const limits = lines.filter((line) => budgetKind(line.type) === 'LIMIT');
  if (limits.length === 0) return { status: 'NONE' };
  const reports = summarizeBudget(
    limits,
    actuals.filter((entry) => budgetKind(entry.type) === 'LIMIT'),
  );

  return {
    status: 'SET',
    currencies: CURRENCIES.flatMap((currency): BudgetCurrencyExecution[] => {
      const inCurrency = reports.filter((report) => report.currency === currency);
      const zero = Money.zero(currency);
      const inLines = limits.filter((line) => line.planned.currency === currency);
      if (inLines.length === 0) return [];
      const planned = inLines.reduce((total, line) => total.add(line.planned), zero);
      const actual = inCurrency.reduce((total, report) => total.add(report.total.actual), zero);

      return [{ currency, planned, actual, executed: actual.percentageOf(planned) }];
    }),
    exceeded: reports
      .flatMap((report) => report.lines)
      .filter((line) => line.status === 'EXCEEDED')
      .sort(
        (left, right) =>
          left.difference.subtract(right.difference).amount.comparedTo(0) ||
          left.categoryId.localeCompare(right.categoryId),
      ),
  };
}

/**
 * Lo cargado en el mes y el estado que cerró en él con fecha límite de pago el mes siguiente
 * (decisión 13). Una tarjeta archivada aparece solo si se movió.
 */
function cardsSection(
  cards: readonly SummaryCardInput[],
  periods: MonthlySummaryPeriods,
): SummaryCard[] {
  const nextMonth = LocalDate.of(periods.year, periods.month, 1).plusMonths(1);

  return cards.flatMap((card): SummaryCard[] => {
    const statement =
      card.statements.find(
        (candidate) =>
          candidate.dueDate.year === nextMonth.year && candidate.dueDate.month === nextMonth.month,
      ) ?? null;
    const moved =
      card.charges.some((charge) => !charge.isZero()) ||
      (statement?.balances.some((entry) => !entry.balance.isZero()) ?? false);
    if (card.archived && !moved) return [];

    return [{ cardId: card.cardId, charges: card.charges, statement }];
  });
}

/**
 * Las metas vivas en el mes (no archivadas, ya empezadas a la fecha de corte y sin terminar antes
 * del mes), con lo aportado en el periodo y su progreso **a la fecha de corte** (2026-10-03).
 */
function goalsSection(
  goals: readonly SummaryGoalInput[],
  periods: MonthlySummaryPeriods,
): SummaryGoal[] {
  const { from, to } = periods.current;

  return goals
    .filter((goal) => !goal.archived && !goal.startDate.isAfter(to) && !goal.endDate.isBefore(from))
    .map((goal) => ({
      goalId: goal.goalId,
      contributed: goal.contributions
        .filter((movement) => !movement.date.isBefore(from) && !movement.date.isAfter(to))
        .reduce(
          (total, movement) =>
            movement.kind === 'WITHDRAWAL'
              ? total.subtract(movement.amount)
              : total.add(movement.amount),
          Money.zero(goal.target.currency),
        ),
      progress: computeGoalProgress({
        target: goal.target,
        startDate: goal.startDate,
        endDate: goal.endDate,
        contributions: goal.contributions,
        today: to,
      }),
    }));
}
