import { Inject, Injectable } from '@nestjs/common';

import { BUDGET_REPOSITORY, type BudgetRepository } from '../ports/budget-repository.js';

/**
 * Pasa las partidas de una categoría fusionada a su destino, en todos los meses (ADR-0005). Lo
 * dispara `catalog.category.merged`: `catalog` ya validó la fusión (misma cuenta y mismo tipo), y
 * la clave foránea compuesta lo vuelve a exigir. Si la destino ya tenía partida ese mes y en esa
 * moneda, se suman (2026-09-29). Repetirlo no cambia nada: la origen ya no tiene partidas.
 *
 * Al convertir una subcategoría en etiqueta no hay nada que mover: las partidas van solo en
 * categorías madre.
 */
@Injectable()
export class ReassignBudgetCategory {
  constructor(@Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository) {}

  async execute({
    userId,
    fromId,
    intoId,
  }: {
    userId: string;
    fromId: string;
    intoId: string;
  }): Promise<number> {
    return this.budgets.mergeCategory(userId, fromId, intoId);
  }
}
