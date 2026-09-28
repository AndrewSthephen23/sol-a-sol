import { Injectable } from '@nestjs/common';
import type { NormalizedTag } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { TagNameTakenError, TagNotFoundError } from '../domain/errors.js';
import type { StoredTag, Tag, TagRepository } from '../ports/tag-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** Una etiqueta con cuántas transacciones **vigentes** la llevan: las borradas no cuentan. */
const SUMMARY = {
  id: true,
  name: true,
  _count: { select: { transactions: { where: { transaction: { deletedAt: null } } } } },
} as const;

interface SummaryRow {
  id: string;
  name: string;
  _count: { transactions: number };
}

@Injectable()
export class PrismaTagRepository implements TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Tag[]> {
    const rows = await this.prisma.tag.findMany({ where: { userId }, select: SUMMARY });

    // Ordenadas aquí, en español, igual que las etiquetas de una transacción.
    return rows.map(toTag).toSorted((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async find(userId: string, id: string): Promise<StoredTag | null> {
    const row = await this.prisma.tag.findFirst({
      where: { id, userId },
      select: { id: true, name: true, nameKey: true },
    });

    return row === null ? null : { id: row.id, name: row.name, key: row.nameKey };
  }

  async findByKey(userId: string, key: string): Promise<StoredTag | null> {
    const row = await this.prisma.tag.findUnique({
      where: { userId_nameKey: { userId, nameKey: key } },
      select: { id: true, name: true, nameKey: true },
    });

    return row === null ? null : { id: row.id, name: row.name, key: row.nameKey };
  }

  async rename(userId: string, id: string, { name, key }: NormalizedTag): Promise<Tag | null> {
    try {
      // `userId` va en el propio UPDATE: la etiqueta de otra cuenta no se toca.
      const { count } = await this.prisma.tag.updateMany({
        where: { id, userId },
        data: { name, nameKey: key },
      });
      if (count === 0) return null;
    } catch (error) {
      // El índice único `(user_id, name_key)` es el que decide si dos peticiones chocan.
      if (isUniqueViolation(error)) throw new TagNameTakenError();
      throw error;
    }

    return this.summary(userId, id);
  }

  async merge(userId: string, fromId: string, intoId: string, name: string): Promise<Tag> {
    return this.prisma.$transaction(async (client) => {
      const links = await client.transactionTag.findMany({
        where: { tagId: fromId, userId },
        select: { transactionId: true },
      });
      // Las que ya tenían las dos no se duplican: la clave primaria las salta.
      await client.transactionTag.createMany({
        data: links.map(({ transactionId }) => ({ transactionId, tagId: intoId, userId })),
        skipDuplicates: true,
      });
      // Borrar la etiqueta borra sus vínculos (`CASCADE`).
      const removed = await client.tag.deleteMany({ where: { id: fromId, userId } });
      const renamed = await client.tag.updateMany({
        where: { id: intoId, userId },
        data: { name },
      });
      // Si alguna desapareció entre medio, se lanza para que la base deshaga todo lo anterior.
      if (removed.count === 0 || renamed.count === 0) throw new TagNotFoundError();

      return toTag(
        await client.tag.findFirstOrThrow({ where: { id: intoId, userId }, select: SUMMARY }),
      );
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    // Sus vínculos se van con ella (`CASCADE`); las transacciones quedan intactas.
    const { count } = await this.prisma.tag.deleteMany({ where: { id, userId } });

    return count > 0;
  }

  private async summary(userId: string, id: string): Promise<Tag | null> {
    const row = await this.prisma.tag.findFirst({ where: { id, userId }, select: SUMMARY });

    return row === null ? null : toTag(row);
  }
}

function toTag(row: SummaryRow): Tag {
  return { id: row.id, name: row.name, transactionCount: row._count.transactions };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
