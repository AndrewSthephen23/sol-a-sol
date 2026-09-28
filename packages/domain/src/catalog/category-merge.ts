import { DomainError } from '../errors/domain-error.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import {
  ArchivedParentCategoryError,
  CategoryTooDeepError,
  categoryNameKey,
} from './category-policy.js';

/**
 * **Fusionar** una categoría en otra: sus transacciones pasan a la destino y ella se archiva. No se
 * deshace; la web muestra antes cuántas transacciones se moverán. Decidido con el autor el
 * 2026-09-28.
 */

export class CategoryMergeSameError extends DomainError {
  readonly code = 'CATEGORY_MERGE_SAME';

  constructor() {
    super('A category cannot be merged into itself.');
  }
}

export class CategoryMergeTypeMismatchError extends DomainError {
  readonly code = 'CATEGORY_MERGE_TYPE_MISMATCH';

  constructor() {
    super('Only categories of the same type merge: their transactions would change type.');
  }
}

export class CategoryMergeIntoOwnChildError extends DomainError {
  readonly code = 'CATEGORY_MERGE_INTO_OWN_CHILD';

  constructor() {
    super('A category cannot be merged into one of its own subcategories.');
  }
}

/** Lo que el plan mira de cada categoría. */
export interface MergeableCategory {
  id: string;
  name: string;
  type: TransactionType;
  parentId: string | null;
  archivedAt: Date | null;
}

/**
 * Qué hacer. `merges`: cada origen se archiva y sus transacciones pasan a su destino (la primera es
 * la pedida). `moves`: hijas que se mudan, con sus transacciones, a otra madre.
 */
export interface CategoryMergePlan {
  merges: { fromId: string; intoId: string }[];
  moves: { id: string; parentId: string }[];
}

/**
 * El plan de fusionar `from` en `into`.
 *
 * - Las dos son **del mismo tipo** (si no, sus transacciones cambiarían de tipo) y la destino está
 *   **activa**. La origen puede estar archivada: volver a fusionarla recupera lo que un oyente no
 *   alcanzó a mover.
 * - Una categoría no se fusiona en sí misma ni en una de sus hijas.
 * - **Las hijas se mudan con ella** a la destino. Si la destino ya tiene una hija con el mismo
 *   nombre (sin mayúsculas ni tildes), esas dos también se fusionan.
 * - Una categoría con hijas no se fusiona en una subcategoría: quedarían dos niveles.
 */
export function planCategoryMerge(
  from: MergeableCategory,
  into: MergeableCategory,
  fromChildren: readonly MergeableCategory[],
  intoChildren: readonly MergeableCategory[],
): CategoryMergePlan {
  if (from.id === into.id) throw new CategoryMergeSameError();
  if (from.type !== into.type) throw new CategoryMergeTypeMismatchError();
  if (into.archivedAt !== null) throw new ArchivedParentCategoryError();
  if (into.parentId === from.id) throw new CategoryMergeIntoOwnChildError();
  if (fromChildren.length > 0 && into.parentId !== null) throw new CategoryTooDeepError();

  const plan: CategoryMergePlan = { merges: [{ fromId: from.id, intoId: into.id }], moves: [] };
  const siblings = new Map(intoChildren.map((child) => [categoryNameKey(child.name), child.id]));
  for (const child of fromChildren) {
    const sameName = siblings.get(categoryNameKey(child.name));
    if (sameName === undefined) {
      plan.moves.push({ id: child.id, parentId: into.id });
    } else {
      plan.merges.push({ fromId: child.id, intoId: sameName });
    }
  }

  return plan;
}
