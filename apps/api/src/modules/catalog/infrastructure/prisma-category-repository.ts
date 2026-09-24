import { Injectable } from '@nestjs/common';
import type { TransactionType } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CategoryNameTakenError } from '../domain/errors.js';
import type {
  Category,
  CategoryArchiving,
  CategoryChanges,
  CategoryRepository,
  NewCategory,
} from '../ports/category-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale en las respuestas. */
const PUBLIC_FIELDS = {
  id: true,
  type: true,
  name: true,
  parentId: true,
  color: true,
  icon: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(category: NewCategory): Promise<Category> {
    return nameMustBeFree(() =>
      this.prisma.category.create({ data: category, select: PUBLIC_FIELDS }),
    );
  }

  async list(userId: string, options: { type?: TransactionType }): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { userId, ...(options.type === undefined ? {} : { type: options.type }) },
      select: PUBLIC_FIELDS,
    });
  }

  async find(userId: string, id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { id, userId }, select: PUBLIC_FIELDS });
  }

  async children(userId: string, parentId: string): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { userId, parentId }, select: PUBLIC_FIELDS });
  }

  async update(
    userId: string,
    id: string,
    changes: CategoryChanges,
    archiving?: CategoryArchiving,
  ): Promise<Category | null> {
    // Una sola transacción: una madre no queda archivada con sus hijas a medias. `userId` va en
    // cada UPDATE: un id ajeno no coincide con ninguna fila.
    return nameMustBeFree(() =>
      this.prisma.$transaction(async (tx) => {
        const { count } = await tx.category.updateMany({ where: { id, userId }, data: changes });
        if (count === 0) return null;
        if (archiving !== undefined) {
          await tx.category.updateMany({
            where: { userId, id: { in: [...archiving.ids] } },
            data: { archivedAt: archiving.archivedAt },
          });
        }

        return tx.category.findFirst({ where: { id, userId }, select: PUBLIC_FIELDS });
      }),
    );
  }
}

/** El índice `categories_unique_sibling_name` es el que decide: dos peticiones a la vez no se cuelan. */
async function nameMustBeFree<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new CategoryNameTakenError();
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
