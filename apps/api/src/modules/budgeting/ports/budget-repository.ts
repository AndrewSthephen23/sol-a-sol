import type { Money, TransactionType } from '@sol-a-sol/domain';

/** Una partida guardada: la categoría madre, su tipo y lo planeado (con su moneda). */
export interface StoredBudgetLine {
  categoryId: string;
  type: TransactionType;
  planned: Money;
}

export interface BudgetMonth {
  userId: string;
  year: number;
  month: number;
}

/**
 * Los presupuestos, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de la
 * consulta, nunca en una comprobación aparte.
 */
export interface BudgetRepository {
  /** Las partidas del mes, en el orden en que se guardaron; `[]` si no hay presupuesto. */
  lines(month: BudgetMonth): Promise<StoredBudgetLine[]>;

  /** Reemplaza **todas** las partidas del mes, de una vez: o quedan todas o ninguna. */
  replace(month: BudgetMonth, lines: readonly StoredBudgetLine[]): Promise<StoredBudgetLine[]>;
}

export const BUDGET_REPOSITORY = Symbol('BudgetRepository');
