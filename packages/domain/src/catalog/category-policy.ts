import { DomainError } from '../errors/domain-error.js';
import { searchKey } from '../text/search-key.js';
import type { TransactionType } from '../transactions/transaction-policy.js';

/** `#RRGGBB`, el formato que entienden los gráficos y la web. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class CategoryTooDeepError extends DomainError {
  readonly code = 'CATEGORY_TOO_DEEP';

  constructor() {
    super('Categories have a single level of subcategories: a subcategory cannot be a parent.');
  }
}

export class CategoryTypeRequiredError extends DomainError {
  readonly code = 'CATEGORY_TYPE_REQUIRED';

  constructor() {
    super('A top-level category needs a type.');
  }
}

export class SubcategoryTypeMismatchError extends DomainError {
  readonly code = 'SUBCATEGORY_TYPE_MISMATCH';

  constructor() {
    super('A subcategory has the type of its parent.');
  }
}

export class ArchivedParentCategoryError extends DomainError {
  readonly code = 'PARENT_CATEGORY_ARCHIVED';

  constructor() {
    super('The parent category is archived. Restore the parent first.');
  }
}

export class InvalidCategoryColorError extends DomainError {
  readonly code = 'INVALID_CATEGORY_COLOR';

  constructor() {
    super('A category color is written as #RRGGBB.');
  }
}

/**
 * La forma de un nombre con la que se comparan dos categorías: sin espacios en los bordes, en
 * minúsculas y sin acentos (`searchKey`). "Café", "CAFE" y " cafe " son la misma categoría.
 *
 * La migración `catalog_category_names_ignore_accents` repite la tabla de acentos en el índice
 * único de la base; una prueba de integración comprueba que coincidan.
 */
export function categoryNameKey(name: string): string {
  return searchKey(name);
}

/**
 * El tipo de una categoría nueva. Una de primer nivel lo necesita; una subcategoría **hereda el de
 * su madre**, y mandar otro es un error, no algo que se corrige en silencio.
 */
export function resolveCategoryType(
  requested: TransactionType | null,
  parent: { type: TransactionType } | null,
): TransactionType {
  if (parent === null) {
    if (requested === null) throw new CategoryTypeRequiredError();

    return requested;
  }
  if (requested !== null && requested !== parent.type) throw new SubcategoryTypeMismatchError();

  return parent.type;
}

/** Un solo nivel: una subcategoría no puede ser madre de otra. */
export function assertCanBeParent(parent: { parentId: string | null }): void {
  if (parent.parentId !== null) throw new CategoryTooDeepError();
}

/**
 * Una subcategoría no se restaura mientras su madre siga archivada: quedaría una hija activa
 * colgando de una madre que ya no se ofrece. `parent` es nulo en una categoría de primer nivel.
 */
export function assertCanRestore(parent: { archivedAt: Date | null } | null): void {
  if (parent?.archivedAt != null) throw new ArchivedParentCategoryError();
}

/**
 * Qué hijas se restauran con su madre: **solo las que se archivaron junto con ella**, que
 * comparten su fecha de archivado exacta. Las que ya estaban archivadas antes siguen así.
 */
export function childrenArchivedWith(
  parentArchivedAt: Date,
  children: readonly { id: string; archivedAt: Date | null }[],
): string[] {
  return children
    .filter((child) => child.archivedAt?.getTime() === parentArchivedAt.getTime())
    .map((child) => child.id);
}

export function assertCategoryColor(color: string): void {
  if (!HEX_COLOR.test(color)) throw new InvalidCategoryColorError();
}
