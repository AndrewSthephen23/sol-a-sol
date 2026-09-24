import { categoryNameKey } from '@sol-a-sol/domain';

import { CategoryNameTakenError } from '../domain/errors.js';
import type {
  Category,
  CategoryArchiving,
  CategoryChanges,
  CategoryRepository,
  CategorySeed,
  NewCategory,
} from './category-repository.js';

interface Row extends Category {
  userId: string;
}

/**
 * Repositorio en memoria para probar los casos de uso sin base de datos. Imita el índice único
 * de la base: nombre por (usuario, tipo, madre), sin mayúsculas ni acentos, contando archivadas.
 */
export class FakeCategoryRepository implements CategoryRepository {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(private readonly now = new Date('2026-09-24T15:00:00.000Z')) {}

  create(category: NewCategory): Promise<Category> {
    this.assertNameFree(category);
    this.sequence += 1;
    const row: Row = {
      ...category,
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      archivedAt: null,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.rows.push(row);

    return Promise.resolve(publicOf(row));
  }

  list(userId: string, options: { type?: string }): Promise<Category[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .filter((row) => options.type === undefined || row.type === options.type)
        .map(publicOf),
    );
  }

  find(userId: string, id: string): Promise<Category | null> {
    const row = this.rowOf(userId, id);

    return Promise.resolve(row === undefined ? null : publicOf(row));
  }

  children(userId: string, parentId: string): Promise<Category[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.userId === userId && row.parentId === parentId).map(publicOf),
    );
  }

  async seedIfEmpty(userId: string, seed: readonly CategorySeed[]): Promise<boolean> {
    if (this.rows.some((row) => row.userId === userId)) return false;
    for (const { children, ...parent } of seed) {
      const created = await this.create({ userId, parentId: null, ...parent });
      for (const child of children) {
        await this.create({ userId, type: parent.type, parentId: created.id, ...child });
      }
    }

    return true;
  }

  update(
    userId: string,
    id: string,
    changes: CategoryChanges,
    archiving?: CategoryArchiving,
  ): Promise<Category | null> {
    const row = this.rowOf(userId, id);
    if (row === undefined) return Promise.resolve(null);
    if (changes.name !== undefined) this.assertNameFree({ ...row, name: changes.name }, id);
    Object.assign(row, changes, { updatedAt: this.now });
    for (const archivedId of archiving?.ids ?? []) {
      const target = this.rowOf(userId, archivedId);
      if (target !== undefined) target.archivedAt = archiving?.archivedAt ?? null;
    }

    return Promise.resolve(publicOf(row));
  }

  private rowOf(userId: string, id: string): Row | undefined {
    return this.rows.find((row) => row.userId === userId && row.id === id);
  }

  private assertNameFree(
    category: Pick<Row, 'userId' | 'type' | 'parentId' | 'name'>,
    exceptId?: string,
  ): void {
    const taken = this.rows.some(
      (row) =>
        row.userId === category.userId &&
        row.type === category.type &&
        row.parentId === category.parentId &&
        row.id !== exceptId &&
        categoryNameKey(row.name) === categoryNameKey(category.name),
    );
    if (taken) throw new CategoryNameTakenError();
  }
}

/** Una copia sin `userId`, como la que devuelve el adaptador de Prisma. */
function publicOf(row: Row): Category {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    parentId: row.parentId,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
