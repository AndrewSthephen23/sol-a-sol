import {
  type Capture,
  type CaptureRepository,
  IdempotencyKeyTakenError,
  type NewCapture,
} from './capture-repository.js';

interface StoredCapture {
  userId: string;
  capture: Capture;
  rawPayload: Record<string, string>;
  idempotencyKey: string;
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
      id: `capture-${String(this.nextId++)}`,
      createdAt: new Date('2026-10-03T17:00:00.000Z'),
    };
    this.stored.push({ userId, capture: created, rawPayload, idempotencyKey });

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
}
