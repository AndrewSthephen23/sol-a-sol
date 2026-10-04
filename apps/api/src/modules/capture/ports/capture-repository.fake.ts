import type { LocalDate } from '@sol-a-sol/domain';

import {
  type Capture,
  type CaptureChanges,
  type CapturePosition,
  type CaptureRepository,
  IdempotencyKeyTakenError,
  type NewCapture,
} from './capture-repository.js';

interface StoredCapture {
  userId: string;
  capture: Capture;
  idempotencyKey: string;
}

/** El orden de la bandeja: primero la más reciente. */
function newestFirst(a: CapturePosition, b: CapturePosition): number {
  return b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id);
}

/** Capturas en memoria, con la misma clave de idempotencia única por cuenta que la base. */
export class FakeCaptureRepository implements CaptureRepository {
  readonly stored: StoredCapture[] = [];
  private nextId = 1;

  findByIdempotencyKey(userId: string, key: string): Promise<Capture | null> {
    const found = this.stored.find(
      (entry) => entry.userId === userId && entry.idempotencyKey === key,
    );

    return Promise.resolve(found === undefined ? null : { ...found.capture });
  }

  create(userId: string, capture: NewCapture): Promise<Capture> {
    const { rawPayload, idempotencyKey, ...fields } = capture;
    if (
      this.stored.some(
        (entry) => entry.userId === userId && entry.idempotencyKey === idempotencyKey,
      )
    ) {
      return Promise.reject(new IdempotencyKeyTakenError());
    }
    const created: Capture = {
      ...fields,
      id: `capture-${String(this.nextId++).padStart(3, '0')}`,
      rawPayload,
      discardedAt: null,
      discardedFrom: null,
      transactionId: null,
      createdAt: new Date('2026-10-03T17:00:00.000Z'),
    };
    this.stored.push({ userId, capture: created, idempotencyKey });

    return Promise.resolve({ ...created });
  }

  listOccurredBetween(userId: string, from: Date, to: Date): Promise<Capture[]> {
    return Promise.resolve(
      this.stored
        .filter(
          (entry) =>
            entry.userId === userId &&
            entry.capture.occurredAt >= from &&
            entry.capture.occurredAt <= to,
        )
        .map((entry) => ({ ...entry.capture })),
    );
  }

  find(userId: string, id: string): Promise<Capture | null> {
    const found = this.stored.find((entry) => entry.userId === userId && entry.capture.id === id);
    return Promise.resolve(found === undefined ? null : { ...found.capture });
  }

  list(
    userId: string,
    statuses: readonly Capture['status'][],
    page: { after: CapturePosition | null; limit: number },
  ): Promise<Capture[]> {
    const { after } = page;
    return Promise.resolve(
      this.stored
        .filter((entry) => entry.userId === userId && statuses.includes(entry.capture.status))
        .map((entry) => ({ ...entry.capture }))
        .toSorted(newestFirst)
        .filter((capture) => after === null || newestFirst(after, capture) < 0)
        .slice(0, page.limit),
    );
  }

  update(
    userId: string,
    id: string,
    changes: CaptureChanges,
    expected: readonly Capture['status'][],
  ): Promise<Capture | null> {
    const found = this.stored.find((entry) => entry.userId === userId && entry.capture.id === id);
    if (found === undefined || !expected.includes(found.capture.status)) {
      return Promise.resolve(null);
    }
    found.capture = { ...found.capture, ...changes };
    return Promise.resolve({ ...found.capture });
  }

  deleteDiscardedBefore(userId: string, cutoff: Date): Promise<number> {
    const before = this.stored.length;
    const kept = this.stored.filter(
      (entry) =>
        entry.userId !== userId ||
        entry.capture.status !== 'DISCARDED' ||
        entry.capture.discardedAt === null ||
        entry.capture.discardedAt >= cutoff,
    );
    this.stored.splice(0, this.stored.length, ...kept);
    return Promise.resolve(before - kept.length);
  }

  listUncategorizedInInbox(userId: string): Promise<Capture[]> {
    return Promise.resolve(
      this.stored
        .filter(
          ({ userId: owner, capture }) =>
            owner === userId &&
            capture.categoryId === null &&
            (capture.status === 'PENDING' || capture.status === 'DUPLICATE'),
        )
        .map(({ capture }) => ({ ...capture })),
    );
  }

  reassignCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    const moved = this.stored.filter(
      ({ userId: owner, capture }) =>
        owner === userId && capture.categoryId === fromId && capture.status !== 'CONFIRMED',
    );
    for (const entry of moved) entry.capture = { ...entry.capture, categoryId: intoId };
    return Promise.resolve(moved.length);
  }

  listInboxBetween(userId: string, from: LocalDate, to: LocalDate): Promise<Capture[]> {
    return Promise.resolve(
      this.stored
        .filter(
          ({ userId: owner, capture }) =>
            owner === userId &&
            (capture.status === 'PENDING' || capture.status === 'DUPLICATE') &&
            !capture.businessDate.isBefore(from) &&
            !capture.businessDate.isAfter(to),
        )
        .map(({ capture }) => ({ ...capture })),
    );
  }
}
