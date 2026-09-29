import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { CATEGORY_MERGED, type CategoryMerged } from '../../catalog/index.js';
import { ReassignBudgetCategory } from '../application/reassign-budget-category.js';

/**
 * Cuando `catalog` fusiona una categoría, sus partidas pasan a la destino (ADR-0005), sin tocar
 * `catalog` ni `transactions`: el presupuesto escucha el mismo evento que las transacciones.
 *
 * Si falla, `@OnEvent` lo registra y la fusión sigue (ADR-0004): la categoría queda archivada con
 * partidas sin mover, que siguen valiendo en sus meses. Volver a fusionarla las mueve.
 */
@Injectable()
export class BudgetCategoryMergedListener {
  constructor(private readonly reassign: ReassignBudgetCategory) {}

  @OnEvent(CATEGORY_MERGED)
  async handle(event: CategoryMerged): Promise<void> {
    await this.reassign.execute(event);
  }
}
