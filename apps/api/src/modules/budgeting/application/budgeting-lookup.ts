import { Inject, Injectable } from '@nestjs/common';
import { assertBudgetMonth, type Money, type TransactionType } from '@sol-a-sol/domain';

import { BUDGET_REPOSITORY, type BudgetRepository } from '../ports/budget-repository.js';

/** Una partida del mes: la categoría madre, su tipo y lo planeado, con su moneda. */
export interface PlannedBudgetLine {
  categoryId: string;
  type: TransactionType;
  planned: Money;
}

/**
 * Lecturas que `budgeting` ofrece a otros módulos por su API pública (`index.ts`), para que el
 * resumen mensual (H6) no lea sus tablas ni importe su interior. Igual que `TransactionsLookup`.
 *
 * Solo lo planeado: lo real lo pone quien lee, con las mismas transacciones que ya consulta.
 * Exige el `userId`.
 */
@Injectable()
export class BudgetingLookup {
  constructor(@Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository) {}

  /** Las partidas del mes, en el orden en que se guardaron; `[]` si no hay presupuesto. */
  async lines(userId: string, year: number, month: number): Promise<PlannedBudgetLine[]> {
    assertBudgetMonth(year, month);

    return this.budgets.lines({ userId, year, month });
  }
}
