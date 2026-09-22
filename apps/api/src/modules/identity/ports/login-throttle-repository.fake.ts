import type { AttemptRecord } from '@sol-a-sol/domain';

import type { LoginThrottleRepository } from './login-throttle-repository.js';

/** Repositorio en memoria para probar el bloqueo sin base de datos. */
export class FakeLoginThrottleRepository implements LoginThrottleRepository {
  readonly records = new Map<string, AttemptRecord>();

  find(key: string): Promise<AttemptRecord | null> {
    return Promise.resolve(this.records.get(key) ?? null);
  }

  save(key: string, record: AttemptRecord): Promise<void> {
    this.records.set(key, record);

    return Promise.resolve();
  }

  clear(keys: string[]): Promise<void> {
    for (const key of keys) this.records.delete(key);

    return Promise.resolve();
  }

  deleteOlderThan(instant: Date): Promise<number> {
    let deleted = 0;

    for (const [key, record] of this.records) {
      if (record.lastFailureAt.getTime() < instant.getTime()) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return Promise.resolve(deleted);
  }
}
