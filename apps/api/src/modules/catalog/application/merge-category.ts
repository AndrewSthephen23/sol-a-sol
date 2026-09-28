import { Inject, Injectable } from '@nestjs/common';
import {
  assertCanConvertToTag,
  type Clock,
  normalizeTagName,
  planCategoryMerge,
} from '@sol-a-sol/domain';

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

    return mergeAndAnnounce(
      { categories: this.categories, events: this.events, now: this.clock.now() },
      userId,
      from,
      into,
    );
  }
}

/**
 * Convierte una subcategoría en etiqueta (decidido con el autor el 2026-09-28): se fusiona en su
 * madre y sus transacciones quedan con la etiqueta de su nombre ("Comida > Desayuno" → "Comida"
 * con `Desayuno`). La etiqueta la pone `transactions` al escuchar la fusión (ADR-0005). Devuelve
 * la madre.
 */
@Injectable()
export class ConvertCategoryToTag {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<Category> {
    const category = await this.categories.find(userId, id);
    if (category === null) throw new CategoryNotFoundError();
    assertCanConvertToTag(category);
    // Antes de cambiar nada: un nombre con `|` no puede ser etiqueta.
    const tag = normalizeTagName(category.name).name;
    const parent =
      category.parentId === null ? null : await this.categories.find(userId, category.parentId);
    if (parent === null) throw new CategoryNotFoundError();

    return mergeAndAnnounce(
      { categories: this.categories, events: this.events, now: this.clock.now() },
      userId,
      category,
      parent,
      tag,
    );
  }
}

/**
 * Valida la fusión, aplica la parte de `catalog` en una sola transacción y la anuncia (ADR-0005).
 * La fusión pedida primero, con la etiqueta si hay; luego las de sus hijas, sin ella.
 */
async function mergeAndAnnounce(
  deps: { categories: CategoryRepository; events: EventPublisher; now: Date },
  userId: string,
  from: Category,
  into: Category,
  tag?: string,
): Promise<Category> {
  const { categories, events } = deps;
  const plan = planCategoryMerge(
    from,
    into,
    await categories.children(userId, from.id),
    await categories.children(userId, into.id),
  );
  await categories.applyMerge(userId, {
    moves: plan.moves,
    archivedIds: plan.merges.map((merge) => merge.fromId),
    archivedAt: deps.now,
  });
  // Después de guardar (ADR-0004).
  for (const [index, { fromId, intoId }] of plan.merges.entries()) {
    const event: CategoryMerged = {
      userId,
      fromId,
      intoId,
      ...(index === 0 && tag !== undefined ? { tag } : {}),
    };
    await events.publish(CATEGORY_MERGED, event);
  }

  const merged = await categories.find(userId, into.id);
  if (merged === null) throw new CategoryNotFoundError();

  return merged;
}
