import type { NormalizedTag } from '@sol-a-sol/domain';

import { TagNotFoundError } from '../domain/errors.js';
import type { StoredTag, Tag, TagRepository } from './tag-repository.js';
import type { FakeTag, FakeTransactionRepository } from './transaction-repository.fake.js';

/**
 * Etiquetas en memoria sobre las **mismas** filas que `FakeTransactionRepository`: renombrar,
 * fusionar o borrar se ve en las transacciones, como en la base.
 */
export class FakeTagRepository implements TagRepository {
  constructor(private readonly transactions: FakeTransactionRepository) {}

  list(userId: string): Promise<Tag[]> {
    return Promise.resolve(
      this.transactions.tags
        .filter((tag) => tag.userId === userId)
        .toSorted((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((tag) => this.summaryOf(tag)),
    );
  }

  find(userId: string, id: string): Promise<StoredTag | null> {
    return Promise.resolve(storedOf(this.tagOf(userId, id)));
  }

  findByKey(userId: string, key: string): Promise<StoredTag | null> {
    return Promise.resolve(
      storedOf(this.transactions.tags.find((tag) => tag.userId === userId && tag.key === key)),
    );
  }

  rename(userId: string, id: string, { name, key }: NormalizedTag): Promise<Tag | null> {
    const tag = this.tagOf(userId, id);
    if (tag === undefined) return Promise.resolve(null);
    Object.assign(tag, { name, key });

    return Promise.resolve(this.summaryOf(tag));
  }

  merge(userId: string, fromId: string, intoId: string, name: string): Promise<Tag> {
    const from = this.tagOf(userId, fromId);
    const into = this.tagOf(userId, intoId);
    if (from === undefined || into === undefined) return Promise.reject(new TagNotFoundError());
    for (const row of this.transactions.rows) {
      if (!row.tagIds.includes(fromId)) continue;
      row.tagIds = [...new Set(row.tagIds.map((id) => (id === fromId ? intoId : id)))];
    }
    this.remove(from);
    into.name = name;

    return Promise.resolve(this.summaryOf(into));
  }

  delete(userId: string, id: string): Promise<boolean> {
    const tag = this.tagOf(userId, id);
    if (tag === undefined) return Promise.resolve(false);
    for (const row of this.transactions.rows) {
      row.tagIds = row.tagIds.filter((tagId) => tagId !== id);
    }
    this.remove(tag);

    return Promise.resolve(true);
  }

  private tagOf(userId: string, id: string): FakeTag | undefined {
    return this.transactions.tags.find((tag) => tag.userId === userId && tag.id === id);
  }

  private remove(tag: FakeTag): void {
    this.transactions.tags.splice(this.transactions.tags.indexOf(tag), 1);
  }

  /** Cuenta solo las transacciones vigentes, como el adaptador de Prisma. */
  private summaryOf(tag: FakeTag): Tag {
    const transactionCount = this.transactions.rows.filter(
      (row) => row.deletedAt === null && row.tagIds.includes(tag.id),
    ).length;

    return { id: tag.id, name: tag.name, transactionCount };
  }
}

function storedOf(tag: FakeTag | undefined): StoredTag | null {
  return tag === undefined ? null : { id: tag.id, name: tag.name, key: tag.key };
}
