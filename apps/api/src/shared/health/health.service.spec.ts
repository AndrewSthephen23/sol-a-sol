import { describe, expect, it } from 'vitest';

import type { DatabasePing } from './database-ping.js';
import { HealthService } from './health.service.js';

const reachableDatabase: DatabasePing = { ping: () => Promise.resolve() };
const unreachableDatabase: DatabasePing = {
  ping: () => Promise.reject(new Error('connection refused')),
};

describe('HealthService', () => {
  it('reports liveness as ok with a non-negative uptime', () => {
    const result = new HealthService(reachableDatabase).check();

    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('is ready when the database responds', async () => {
    const result = await new HealthService(reachableDatabase).checkReadiness();

    expect(result).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('is not ready when the database does not respond', async () => {
    const result = await new HealthService(unreachableDatabase).checkReadiness();

    expect(result).toEqual({ status: 'error', checks: { database: 'down' } });
  });
});
