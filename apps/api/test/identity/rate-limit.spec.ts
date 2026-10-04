import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';

const LOGIN = `/${API_PREFIX}/auth/login`;
const OPENAPI = `/${API_PREFIX}/openapi.json`;
const CAPTURES = `/${API_PREFIX}/captures`;
const CAPTURE = { source: 'IOS_SHORTCUT', occurredAt: '2026-10-03T11:30:00-05:00' };
const CREDENTIALS = { email: 'caudal@example.com', password: 'caballo grapa batería' };
const AUTH_LIMIT = 3;
const CAPTURE_LIMIT = 4;
const GENERAL_LIMIT = 10;
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';

/**
 * El tope de caudal por IP, que es otra cosa que el bloqueo por intentos fallidos: aquí no hay
 * credenciales de por medio, solo cuántas peticiones llegan.
 */
describe('the rate limit', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.FEATURE_CAPTURE = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    // Los topes se leen al levantar la aplicación, así que se fijan antes de compilarla.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = String(AUTH_LIMIT);
    process.env.RATE_LIMIT_PER_MINUTE = String(GENERAL_LIMIT);
    process.env.CAPTURE_RATE_LIMIT_PER_MINUTE = String(CAPTURE_LIMIT);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    delete process.env.FEATURE_IDENTITY;
    delete process.env.FEATURE_CAPTURE;
    delete process.env.AUTH_JWT_SECRET;
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '100000';
    process.env.RATE_LIMIT_PER_MINUTE = '100000';
    process.env.CAPTURE_RATE_LIMIT_PER_MINUTE = '100000';
    await app.close();
  });

  it('turns away the request past the limit on /auth', async () => {
    for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
      await request(server).post(LOGIN).send(CREDENTIALS).expect(401);
    }

    const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(429);

    expect((response.body as ProblemDetails).type).toBe(problemType('TOO_MANY_REQUESTS'));
  });

  // El tope de `/auth` es aparte y más estricto: agotarlo no cierra el resto de la API.
  it('counts the rest of the API on its own, looser limit', async () => {
    for (let attempt = 0; attempt < AUTH_LIMIT + 2; attempt++) {
      await request(server).get(OPENAPI).expect(200);
    }
  });

  // Se cuenta por IP y antes de mirar el token (decidido el 2026-10-04): quien prueba tokens al
  // azar también choca con el tope.
  it('turns away the capture past its own limit, token or not', async () => {
    for (let attempt = 0; attempt < CAPTURE_LIMIT; attempt++) {
      await request(server).post(CAPTURES).send(CAPTURE).expect(401);
    }

    const response = await request(server).post(CAPTURES).send(CAPTURE).expect(429);

    expect((response.body as ProblemDetails).type).toBe(problemType('TOO_MANY_REQUESTS'));
    // El resto de la API sigue con su propio cupo.
    await request(server).get(OPENAPI).expect(200);
  });

  it('does not limit the health checks, which Docker asks for every few seconds', async () => {
    for (let attempt = 0; attempt < GENERAL_LIMIT + 5; attempt++) {
      await request(server).get('/health').expect(200);
    }
  });
});
