import type { Decimal } from 'decimal.js';

import { DomainError } from '../errors/domain-error.js';
import { Money } from '../money/money.js';
import { ArchivedCategoryError, type TransactionType } from '../transactions/transaction-policy.js';

/**
 * Reglas del presupuesto mensual, decididas con el autor el 2026-09-29 (`docs/modules/budgeting.md`).
 *
 * Se presupuestan **todos los tipos**, pero no se leen igual:
 *
 * - **Límite** (gasto fijo, gasto variable y deuda): lo planeado es un tope. Pasarse es malo.
 * - **Meta** (ingreso, ahorro e inversión): lo planeado es a dónde llegar. Pasarse es bueno.
 */
export type BudgetKind = 'LIMIT' | 'GOAL';

const GOAL_TYPES: readonly TransactionType[] = ['INCOME', 'SAVING', 'INVESTMENT'];

export function budgetKind(type: TransactionType): BudgetKind {
  return GOAL_TYPES.includes(type) ? 'GOAL' : 'LIMIT';
}

/** Años que tiene sentido presupuestar: lo mismo que exige la base (`budgets_year_range`). */
const FIRST_YEAR = 2000;
const LAST_YEAR = 2100;
const DECEMBER = 12;

export class InvalidBudgetMonthError extends DomainError {
  readonly code = 'BUDGET_MONTH_INVALID';

  constructor(year: number, month: number) {
    super(`There is no budget month ${String(year)}-${String(month)}.`);
  }
}

export class NegativeBudgetAmountError extends DomainError {
  readonly code = 'BUDGET_AMOUNT_NEGATIVE';

  constructor() {
    super('A planned amount cannot be negative: zero means "spend nothing here".');
  }
}

export class BudgetCategoryNotTopLevelError extends DomainError {
  readonly code = 'BUDGET_CATEGORY_NOT_TOP_LEVEL';

  constructor() {
    super('A budget line goes on a top-level category, which already adds up its subcategories.');
  }
}

export class DuplicatedBudgetLineError extends DomainError {
  readonly code = 'BUDGET_LINE_DUPLICATED';

  constructor(
    readonly categoryId: string,
    currency: string,
  ) {
    super(`The budget has two lines for ${categoryId} in ${currency}.`);
  }
}

/** Un presupuesto es de un mes del calendario, en un año razonable. Se puede el pasado y el futuro. */
export function assertBudgetMonth(year: number, month: number): void {
  const validYear = Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= DECEMBER;
  if (!validYear || !validMonth) throw new InvalidBudgetMonthError(year, month);
}

/**
 * Cero o más. Cero es una decisión («aquí no gastar nada»), no un olvido. Un tercer decimal ni
 * siquiera llega aquí: `Money` lo rechaza antes, sin redondear.
 */
export function assertPlannedAmount(planned: Money): void {
  if (planned.isNegative()) throw new NegativeBudgetAmountError();
}

/**
 * La partida va en una categoría **madre** y activa. La madre ya suma lo de sus hijas, así que
 * presupuestar una hija contaría dos veces (decisión 2 de H4). Una archivada no recibe partidas
 * nuevas, igual que no recibe transacciones nuevas.
 */
export function assertBudgetableCategory(category: {
  parentId: string | null;
  archived: boolean;
}): void {
  if (category.parentId !== null) throw new BudgetCategoryNotTopLevelError();
  if (category.archived) throw new ArchivedCategoryError();
}

export interface PlannedLine {
  categoryId: string;
  planned: Money;
}

/** Las partidas de un mes: cada una válida, y una sola por categoría y moneda (decisión 3). */
export function assertBudgetLines(lines: readonly PlannedLine[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    assertPlannedAmount(line.planned);
    const key = `${line.categoryId}|${line.planned.currency}`;
    if (seen.has(key)) throw new DuplicatedBudgetLineError(line.categoryId, line.planned.currency);
    seen.add(key);
  }
}

/**
 * - Límite: `WITHIN` (todavía dentro) o `EXCEEDED` (apenas real > planeado, sin tolerancia).
 * - Meta: `PENDING` (todavía no llega) o `MET` (llegó o se pasó).
 */
export type BudgetStatus = 'WITHIN' | 'EXCEEDED' | 'PENDING' | 'MET';

export interface BudgetVariance {
  planned: Money;
  actual: Money;
  /**
   * Siempre «lo bueno es positivo». Límite: planeado − real (lo disponible; negativo, cuánto me
   * pasé). Meta: real − planeado (cuánto superé la meta; negativo, cuánto falta).
   */
  difference: Money;
  /** Real sobre planeado, en %, sin redondear. `null` con lo planeado en cero: no hay porcentaje. */
  executed: Decimal | null;
  status: BudgetStatus;
}

/**
 * Presupuestado contra real para una partida, con la lectura de su tipo. Monedas distintas lanzan
 * error: nunca se compara S/ con US$ ni se convierte.
 */
export function computeBudgetVariance(
  type: TransactionType,
  planned: Money,
  actual: Money,
): BudgetVariance {
  const executed = actual.percentageOf(planned);
  const over = actual.subtract(planned);

  if (budgetKind(type) === 'GOAL') {
    return {
      planned,
      actual,
      difference: over,
      executed,
      status: over.isNegative() ? 'PENDING' : 'MET',
    };
  }

  return {
    planned,
    actual,
    difference: planned.subtract(actual),
    executed,
    status: over.isPositive() ? 'EXCEEDED' : 'WITHIN',
  };
}
