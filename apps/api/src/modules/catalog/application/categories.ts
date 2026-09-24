import { Inject, Injectable } from '@nestjs/common';
import {
  assertCanBeParent,
  assertCanRestore,
  assertCategoryColor,
  ArchivedParentCategoryError,
  childrenArchivedWith,
  type Clock,
  resolveCategoryType,
  type TransactionType,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { CategoryNotFoundError } from '../domain/errors.js';
import {
  type Category,
  type CategoryArchiving,
  type CategoryChanges,
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../ports/category-repository.js';

/** Color e ícono de una categoría de primer nivel que no los trae. */
export const DEFAULT_CATEGORY_COLOR = '#607D8B';
export const DEFAULT_CATEGORY_ICON = 'tag';

export interface CreateCategoryInput {
  userId: string;
  name: string;
  type?: TransactionType;
  parentId?: string;
  color?: string;
  icon?: string;
}

@Injectable()
export class CreateCategory {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const parent = await this.parentOf(input);
    const color = input.color ?? parent?.color ?? DEFAULT_CATEGORY_COLOR;
    assertCategoryColor(color);

    return this.categories.create({
      userId: input.userId,
      type: resolveCategoryType(input.type ?? null, parent),
      name: input.name,
      parentId: parent?.id ?? null,
      color,
      icon: input.icon ?? parent?.icon ?? DEFAULT_CATEGORY_ICON,
    });
  }

  /**
   * La madre elegida: del mismo usuario (si no, 404, sin confirmar que existe), de primer nivel
   * y activa. Colgar una hija nueva de una madre archivada dejaría una hija activa escondida.
   */
  private async parentOf(input: CreateCategoryInput): Promise<Category | null> {
    if (input.parentId === undefined) return null;

    const parent = await this.categories.find(input.userId, input.parentId);
    if (parent === null) throw new CategoryNotFoundError();
    assertCanBeParent(parent);
    if (parent.archivedAt !== null) throw new ArchivedParentCategoryError();

    return parent;
  }
}

/** Una categoría de primer nivel con sus subcategorías. */
export interface CategoryTreeNode extends Category {
  children: Category[];
}

@Injectable()
export class ListCategories {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  /**
   * Las categorías del usuario, anidadas y ordenadas por nombre (en español: "Árbol" va con la
   * "a"). Sin las archivadas, salvo que se pidan.
   */
  async execute(input: {
    userId: string;
    type?: TransactionType;
    includeArchived: boolean;
  }): Promise<CategoryTreeNode[]> {
    const all = await this.categories.list(input.userId, { type: input.type });
    const visible = all
      .filter((category) => input.includeArchived || category.archivedAt === null)
      .toSorted(byName);

    return visible
      .filter((category) => category.parentId === null)
      .map((parent) => ({
        ...parent,
        children: visible.filter((category) => category.parentId === parent.id),
      }));
  }
}

function byName(a: Category, b: Category): number {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

export interface UpdateCategoryInput {
  userId: string;
  id: string;
  changes: CategoryChanges & { archived?: boolean };
}

@Injectable()
export class UpdateCategory {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id, changes }: UpdateCategoryInput): Promise<Category> {
    const current = await this.categories.find(userId, id);
    if (current === null) throw new CategoryNotFoundError();

    const { archived, ...fields } = changes;
    if (fields.color !== undefined) assertCategoryColor(fields.color);
    const archiving = await this.archivingFor(userId, current, archived);

    const updated = await this.categories.update(userId, id, fields, archiving);
    // Entre la lectura y la escritura pudo desaparecer: para quien llama, simplemente no existe.
    if (updated === null) throw new CategoryNotFoundError();

    return updated;
  }

  /**
   * - **Archivar** una madre archiva también sus hijas activas, con la misma fecha.
   * - **Restaurar** una madre devuelve solo las hijas que se archivaron con ella (misma fecha);
   *   las que ya estaban archivadas antes siguen así.
   * - Una subcategoría **no se restaura** con su madre archivada.
   * - Archivar lo archivado o restaurar lo activo no cambia nada: la fecha original se conserva.
   */
  private async archivingFor(
    userId: string,
    current: Category,
    archived: boolean | undefined,
  ): Promise<CategoryArchiving | undefined> {
    if (archived === true && current.archivedAt === null) {
      const children = await this.categories.children(userId, current.id);
      const active = children.filter((child) => child.archivedAt === null);

      return {
        ids: [current.id, ...active.map((child) => child.id)],
        archivedAt: this.clock.now(),
      };
    }
    if (archived === false && current.archivedAt !== null) {
      const parent =
        current.parentId === null ? null : await this.categories.find(userId, current.parentId);
      assertCanRestore(parent);
      const children = await this.categories.children(userId, current.id);

      return {
        ids: [current.id, ...childrenArchivedWith(current.archivedAt, children)],
        archivedAt: null,
      };
    }

    return undefined;
  }
}
