import { Inject, Injectable } from '@nestjs/common';
import { type Clock, planCategoryMerge } from '@sol-a-sol/domain';

import { EVENT_PUBLISHER, type EventPublisher } from '../../../shared/events/event-publisher.js';
import { CLOCK } from '../../../shared/time/system-clock.js';
import { CategoryNotFoundError } from '../domain/errors.js';
import { CATEGORY_MERGED, type CategoryMerged } from '../domain/events.js';
import {
  type Category,
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../ports/category-repository.js';

/**
 * Fusiona una categoría en otra (decidido con el autor el 2026-09-28, ADR-0005): sus hijas se
 * mudan con ella, las del mismo nombre se fusionan también, y los orígenes se archivan. No se
 * deshace.
 *
 * `catalog` cambia sus categorías y **anuncia** cada fusión; mover las transacciones es cosa de
 * `transactions`, que escucha `catalog.category.merged`. Volver a fusionar un origen ya archivado
 * vuelve a anunciarlo, y así recupera lo que un oyente no alcanzó a mover.
 */
@Injectable()
export class MergeCategory {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({
    userId,
    id,
    intoId,
  }: {
    userId: string;
    id: string;
    intoId: string;
  }): Promise<Category> {
    const from = await this.categories.find(userId, id);
    const into = await this.categories.find(userId, intoId);
    if (from === null || into === null) throw new CategoryNotFoundError();

    const plan = planCategoryMerge(
      from,
      into,
      await this.categories.children(userId, from.id),
      await this.categories.children(userId, into.id),
    );
    await this.categories.applyMerge(userId, {
      moves: plan.moves,
      archivedIds: plan.merges.map((merge) => merge.fromId),
      archivedAt: this.clock.now(),
    });
    // Después de guardar (ADR-0004). La fusión pedida primero; luego las de sus hijas.
    for (const { fromId, intoId: target } of plan.merges) {
      const event: CategoryMerged = { userId, fromId, intoId: target };
      await this.events.publish(CATEGORY_MERGED, event);
    }

    const merged = await this.categories.find(userId, into.id);
    if (merged === null) throw new CategoryNotFoundError();

    return merged;
  }
}
