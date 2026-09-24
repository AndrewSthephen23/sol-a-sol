import type { TransactionType } from '@sol-a-sol/domain';

/** Todo lo que se guarda de una categoría o subcategoría. */
export interface Category {
  id: string;
  type: TransactionType;
  name: string;
  /** Nulo en una categoría de primer nivel. */
  parentId: string | null;
  color: string;
  icon: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCategory {
  userId: string;
  type: TransactionType;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
}

/** Lo que se puede cambiar. El tipo y la madre no están: no se cambian. */
export interface CategoryChanges {
  name?: string;
  color?: string;
  icon?: string;
}

/** Categorías que cambian de estado junto con la editada: ella misma y, en cascada, sus hijas. */
export interface CategoryArchiving {
  ids: readonly string[];
  archivedAt: Date | null;
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`: no existe forma de leer o cambiar
 * una categoría sin decir de quién es.
 */
export interface CategoryRepository {
  /** Lanza `CategoryNameTakenError` si una hermana del mismo tipo ya tiene ese nombre. */
  create(category: NewCategory): Promise<Category>;

  /** Todas las del usuario (archivadas incluidas), opcionalmente de un tipo. */
  list(userId: string, options: { type?: TransactionType }): Promise<Category[]>;

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<Category | null>;

  children(userId: string, parentId: string): Promise<Category[]>;

  /**
   * Crea la semilla **solo si la cuenta no tiene ninguna categoría**, en una sola transacción:
   * o quedan todas, o ninguna. `false` si ya tenía alguna (y entonces no toca nada), también
   * cuando otra petición la sembró al mismo tiempo.
   */
  seedIfEmpty(userId: string, seed: readonly CategorySeed[]): Promise<boolean>;

  /**
   * Aplica los cambios y el archivado **en una sola transacción**: o cambia todo, o nada.
   * `null` si no existe o es de otra cuenta. Lanza `CategoryNameTakenError` si el nombre choca.
   */
  update(
    userId: string,
    id: string,
    changes: CategoryChanges,
    archiving?: CategoryArchiving,
  ): Promise<Category | null>;
}

/** Una categoría de la semilla con sus subcategorías, ya con todos sus datos resueltos. */
export interface CategorySeed {
  type: TransactionType;
  name: string;
  color: string;
  icon: string;
  children: readonly { name: string; color: string; icon: string }[];
}

export const CATEGORY_REPOSITORY = Symbol('CategoryRepository');
