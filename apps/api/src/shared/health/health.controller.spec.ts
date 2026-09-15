import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabasePing } from './database-ping.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

async function createController(databasePing: DatabasePing): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: DatabasePing, useValue: databasePing }],
  }).compile();

  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('resolves its dependencies through Nest DI and reports liveness', async () => {
    const controller = await createController({ ping: () => Promise.resolve() });

    expect(controller.check().status).toBe('ok');
  });

  it('returns the readiness status when the database is up', async () => {
    const controller = await createController({ ping: () => Promise.resolve() });

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('responds 503 when the database is down', async () => {
    const controller = await createController({
      ping: () => Promise.reject(new Error('connection refused')),
    });

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
