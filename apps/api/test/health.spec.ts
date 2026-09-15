import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { API_PREFIX, configureApp } from '../src/app.setup.js';

describe('health endpoints', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responds 200 with status ok outside the API prefix', async () => {
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready responds 200 when PostgreSQL is reachable', async () => {
    const response = await request(server).get('/health/ready').expect(200);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('health endpoints are not exposed under the versioned API prefix', async () => {
    await request(server).get(`/${API_PREFIX}/health`).expect(404);
    await request(server).get(`/${API_PREFIX}/health/ready`).expect(404);
  });
});
