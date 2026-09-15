import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { API_PREFIX, configureApp } from '../src/app.setup.js';

describe('GET /health', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with status ok outside the API prefix', async () => {
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('is not exposed under the versioned API prefix', async () => {
    await request(server).get(`/${API_PREFIX}/health`).expect(404);
  });
});
