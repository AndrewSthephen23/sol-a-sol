import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { CATEGORY_MERGED, type CategoryMerged } from '../../catalog/index.js';
import { ReassignCategory } from '../application/reassign-category.js';

/**
 * Cuando `catalog` fusiona una categoría, sus transacciones pasan a la destino (ADR-0005).
 *
 * Si falla, `@OnEvent` lo registra y la fusión sigue (ADR-0004): la categoría queda archivada con
 * transacciones sin mover, que siguen siendo válidas. Volver a fusionarla las mueve.
 */
@Injectable()
export class CategoryMergedListener {
  constructor(private readonly reassign: ReassignCategory) {}

  @OnEvent(CATEGORY_MERGED)
  async handle(event: CategoryMerged): Promise<void> {
    await this.reassign.execute(event);
  }
}
