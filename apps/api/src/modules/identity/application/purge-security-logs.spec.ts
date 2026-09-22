import { FixedClock } from '@sol-a-sol/domain';
import { describe, expect, it, vi } from 'vitest';

import type { AuditLogCleaner } from '../ports/audit-log-cleaner.js';
import { FakeLoginThrottleRepository } from '../ports/login-throttle-repository.fake.js';
import { PurgeSecurityLogs } from './purge-security-logs.js';

const CLOCK = FixedClock.at('2026-09-22T15:00:00.000Z');

function purgeWith(attempts: FakeLoginThrottleRepository) {
  const deleteOlderThan = vi.fn(() => Promise.resolve(3));
  const auditLog: AuditLogCleaner = { deleteOlderThan };

  return { purge: new PurgeSecurityLogs(auditLog, attempts, CLOCK), deleteOlderThan };
}

describe('PurgeSecurityLogs', () => {
  it('deletes audit entries older than a year', async () => {
    const { purge, deleteOlderThan } = purgeWith(new FakeLoginThrottleRepository());

    const purged = await purge.execute();

    expect(deleteOlderThan).toHaveBeenCalledWith(new Date('2025-09-22T15:00:00.000Z'));
    expect(purged.auditEntries).toBe(3);
  });

  // Un intento cuyo último fallo ya se olvidó no cuenta para nada: su fila sobra.
  it('deletes the attempts whose failures are already forgotten', async () => {
    const attempts = new FakeLoginThrottleRepository();
    await attempts.save('email:viejo', {
      failures: 3,
      lastFailureAt: new Date('2026-09-21T14:59:59.999Z'),
      lockedUntil: null,
    });
    await attempts.save('email:reciente', {
      failures: 1,
      lastFailureAt: new Date('2026-09-22T14:00:00.000Z'),
      lockedUntil: null,
    });
    const { purge } = purgeWith(attempts);

    const purged = await purge.execute();

    expect(purged.loginAttempts).toBe(1);
    expect([...attempts.records.keys()]).toEqual(['email:reciente']);
  });

  it('reads the instant from the clock, never from the real time', async () => {
    const attempts = new FakeLoginThrottleRepository();
    const deleteOlderThan = vi.fn(() => Promise.resolve(0));
    const purge = new PurgeSecurityLogs(
      { deleteOlderThan },
      attempts,
      FixedClock.at('2030-01-01T00:00:00.000Z'),
    );

    await purge.execute();

    expect(deleteOlderThan).toHaveBeenCalledWith(new Date('2029-01-01T00:00:00.000Z'));
  });
});
