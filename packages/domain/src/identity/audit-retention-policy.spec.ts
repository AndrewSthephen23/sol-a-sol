import { describe, expect, it } from 'vitest';

import { FixedClock } from '../time/clock.js';
import { AUDIT_LOG_RETENTION_DAYS, auditLogCutoff } from './audit-retention-policy.js';

describe('audit log retention', () => {
  it('keeps a year of entries', () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(365);
  });

  it('puts the cutoff a year before now', () => {
    expect(auditLogCutoff(FixedClock.at('2026-09-22T15:00:00.000Z'))).toEqual(
      new Date('2025-09-22T15:00:00.000Z'),
    );
  });

  it('reads the instant from the clock, never from the real time', () => {
    expect(auditLogCutoff(FixedClock.at('2030-01-01T00:00:00.000Z'))).toEqual(
      new Date('2029-01-01T00:00:00.000Z'),
    );
  });
});
