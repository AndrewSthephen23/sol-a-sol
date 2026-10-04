import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { CATEGORY_MERGED, type CategoryMerged } from '../../catalog/index.js';
import { FollowCategoryMerge } from '../application/rules.js';

/**
 * Cuando `catalog` fusiona una categoría, las reglas y las capturas sin confirmar de la origen
 * pasan a la destino (ADR-0005), sin tocar `catalog`: la bandeja escucha el mismo evento que las
 * transacciones y el presupuesto.
 *
 * Si falla, `@OnEvent` lo registra y la fusión sigue (ADR-0004). Volver a fusionar las mueve.
 */
@Injectable()
export class CaptureCategoryMergedListener {
  constructor(private readonly follow: FollowCategoryMerge) {}

  @OnEvent(CATEGORY_MERGED)
  async handle(event: CategoryMerged): Promise<void> {
    await this.follow.execute(event);
  }
}
