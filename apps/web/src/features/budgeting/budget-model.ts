import { formatPercentage, parseAmount } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import type { TransactionType } from '@/features/transactions/filters';

export type BudgetResponse =
  paths['/api/v1/budgets/{year}/{month}']['get']['responses'][200]['content']['application/json'];
export type CopiedBudgetResponse =
  paths['/api/v1/budgets/{year}/{month}/copy-from-previous']['post']['responses'][200]['content']['application/json'];
export type BudgetReport = BudgetResponse['summary'][number];
export type Variance = BudgetReport['total'];
export type BudgetLineBody = NonNullable<
  paths['/api/v1/budgets/{year}/{month}']['put']['requestBody']
>['content']['application/json']['lines'][number];

/** Metas: lo bueno es llegar o pasarse. El resto (gasto y deuda) son límites. */
const GOAL_TYPES: readonly TransactionType[] = ['INCOME', 'SAVING', 'INVESTMENT'];

export function isGoal(type: TransactionType): boolean {
  return GOAL_TYPES.includes(type);
}

/** Sin el signo: «te pasaste S/ 45.00», no «te pasaste -S/ 45.00». */
function withoutSign(amount: string): string {
  return amount.startsWith('-') ? amount.slice(1) : amount;
}

/**
 * Qué significa una partida, en una frase: para un límite, cuánto queda o cuánto se pasó; para una
 * meta, cuánto falta o si se cumplió (decisión 4 de H4).
 */
export function varianceText(variance: Variance, currency: Currency): string {
  const amount = formatMoney(withoutSign(variance.difference), currency);
  switch (variance.status) {
    case 'EXCEEDED':
      return `Te pasaste ${amount}`;
    case 'WITHIN':
      return `Quedan ${amount}`;
    case 'PENDING':
      return `Faltan ${amount}`;
    case 'MET':
      return variance.difference.startsWith('-') || /^0(\.0+)?$/u.test(variance.difference)
        ? 'Cumplida'
        : `Cumplida, ${amount} de más`;
  }
}

/** El % ejecutado con 2 decimales (redondeo bancario); «—» si lo planeado es cero. */
export function executedText(executed: string | null): string {
  return executed === null ? '—' : `${formatPercentage(executed)} %`;
}

/**
 * Qué tan llena va la barra, de 0 a 100. Es **solo para dibujar**: el número nunca se muestra ni se
 * usa para calcular (eso va en texto, con `executedText`).
 */
export function barWidth(executed: string | null): number {
  if (executed === null) return 0;
  const value = Number(executed);

  return Math.max(0, Math.min(100, value));
}

// --- Edición -------------------------------------------------------------------------------------

/** Una partida mientras se edita: el monto tal como está escrito. */
export interface DraftLine {
  categoryId: string;
  currency: Currency;
  amount: string;
}

export function draftFrom(budget: BudgetResponse): DraftLine[] {
  return budget.lines.map((line) => ({
    categoryId: line.categoryId,
    currency: line.currency,
    amount: line.plannedAmount,
  }));
}

export function draftKey(line: Pick<DraftLine, 'categoryId' | 'currency'>): string {
  return `${line.categoryId}|${line.currency}`;
}

const CURRENCY_NAMES: Readonly<Record<Currency, string>> = { PEN: 'soles', USD: 'dólares' };

/**
 * Un monto planeado, con las reglas del dominio (`parseAmount`): punto decimal y coma de miles, a
 * lo más 2 decimales (más se rechaza, no se redondea). **Cero o más**: cero es «aquí no gastar
 * nada». Se puede escribir la moneda (`S/ 800`), pero tiene que ser la de la partida.
 */
export function readPlannedAmount(
  text: string,
  currency: Currency,
): { amount: string } | { error: string } {
  if (text.trim() === '') return { error: 'Escribe el monto (0 si no quieres gastar nada aquí).' };
  let money;
  try {
    money = parseAmount(text, { defaultCurrency: currency });
  } catch {
    return { error: 'Escribe el monto con punto decimal y hasta 2 decimales, como 800.00.' };
  }
  if (money.currency !== currency) {
    return {
      error: `El monto está en ${CURRENCY_NAMES[money.currency]}, no en ${CURRENCY_NAMES[currency]}.`,
    };
  }
  if (money.isNegative()) return { error: 'El monto no puede ser negativo.' };

  return { amount: money.toFixed() };
}

/** Revisa el borrador y arma las partidas para el `PUT`, con los montos como texto. */
export function checkDraft(
  draft: readonly DraftLine[],
): { lines: BudgetLineBody[] } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const lines: BudgetLineBody[] = [];
  for (const line of draft) {
    const amount = readPlannedAmount(line.amount, line.currency);
    if ('error' in amount) errors[draftKey(line)] = amount.error;
    else
      lines.push({
        categoryId: line.categoryId,
        currency: line.currency,
        plannedAmount: amount.amount,
      });
  }

  return Object.keys(errors).length > 0 ? { errors } : { lines };
}

/** Errores de la API del presupuesto, en español (la API los manda en inglés, para depurar). */
const API_ERRORS: Readonly<Record<string, string>> = {
  BUDGET_AMOUNT_NEGATIVE: 'Un monto planeado no puede ser negativo.',
  BUDGET_CATEGORY_NOT_TOP_LEVEL:
    'El presupuesto va en categorías principales, no en subcategorías.',
  BUDGET_LINE_DUPLICATED: 'Hay dos partidas de la misma categoría en la misma moneda.',
  BUDGET_MONTH_INVALID: 'Ese mes no existe.',
  CATEGORY_ARCHIVED: 'Una de las categorías está archivada.',
  CATEGORY_NOT_FOUND: 'Una de las categorías ya no existe.',
  INVALID_AMOUNT: 'Un monto tiene más de 2 decimales.',
};

export function budgetErrorMessage(code: string | null): string | null {
  return code === null ? null : (API_ERRORS[code] ?? null);
}
