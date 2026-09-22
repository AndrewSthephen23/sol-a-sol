import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ACCESS_TOKEN_TTL_SECONDS } from '@sol-a-sol/domain';
import { decodeJwt, jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import type { AccessTokenResponse } from '../../src/modules/identity/http/auth.controller.js';
import { type ProblemDetails } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
// Obviamente falsa y de 34 caracteres: no es la clave de ningún entorno real.
const SECRET = 'clave-de-prueba-no-real-0123456789';

describe('POST /auth/login', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.AUTH_JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    process.env.REGISTRATION_MODE = 'closed';
    await request(server).post(REGISTER).send(CREDENTIALS).expect(201);
  });

  afterAll(async () => {
    // Los archivos comparten el mismo PostgreSQL: se devuelve la tabla como se encontró,
    // o el siguiente se topa con cuentas que no creó.
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  describe('with the right credentials', () => {
    it('answers 200 with a bearer token', async () => {
      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);
      const body = response.body as AccessTokenResponse;

      expect(body.tokenType).toBe('Bearer');
      expect(body.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
      expect(body.accessToken).toEqual(expect.any(String));
    });

    it('signs a token that verifies and says who it belongs to', async () => {
      const account = await prisma.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } });
      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);

      const { payload } = await jwtVerify(
        (response.body as AccessTokenResponse).accessToken,
        new TextEncoder().encode(SECRET),
      );
      expect(payload.sub).toBe(account.id);
    });

    it('puts nothing personal in the token, which travels signed but readable', async () => {
      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);
      const payload = decodeJwt((response.body as AccessTokenResponse).accessToken);

      expect(Object.keys(payload).toSorted()).toEqual(['exp', 'iat', 'sub']);
      expect(JSON.stringify(payload)).not.toContain(CREDENTIALS.email);
    });

    it('gives the token fifteen minutes of life', async () => {
      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);
      const { iat, exp } = decodeJwt((response.body as AccessTokenResponse).accessToken);

      expect((exp ?? 0) - (iat ?? 0)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    });

    it('accepts the email however it was capitalised', async () => {
      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, email: '  Ana@Example.COM  ' })
        .expect(200);
    });

    it('never lets the hash out with the token', async () => {
      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);

      expect(JSON.stringify(response.body)).not.toContain('$argon2id$');
      expect(JSON.stringify(response.body)).not.toContain(CREDENTIALS.password);
    });
  });

  describe('without them', () => {
    it('rejects a wrong password with 401', async () => {
      const response = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, password: 'otra contraseña larga' })
        .expect(401);

      expect((response.body as ProblemDetails).type).toBe(
        'urn:sol-a-sol:error:invalid-credentials',
      );
    });

    it('rejects an unknown email with 401', async () => {
      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, email: 'nadie@example.com' })
        .expect(401);
    });

    // Si las dos respuestas se distinguieran, se podría averiguar qué correos tienen cuenta.
    it('answers both cases with byte-for-byte the same body', async () => {
      const wrongPassword = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, password: 'otra contraseña larga' })
        .expect(401);
      const unknownEmail = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, email: 'nadie@example.com' })
        .expect(401);

      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('does not say which of the two was wrong', async () => {
      const response = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, email: 'nadie@example.com' })
        .expect(401);

      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/not found|no existe|unknown|desconocid/i);
      expect(body).not.toContain('nadie@example.com');
    });

    it('rejects an invalid email with 422 before checking anything', async () => {
      const response = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, email: 'no-es-correo' })
        .expect(422);

      expect((response.body as ProblemDetails).errors?.[0]?.field).toBe('email');
    });
  });

  describe('when the module is switched off', () => {
    it('answers 404, like a route that does not exist', async () => {
      process.env.FEATURE_IDENTITY = 'false';

      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(404);

      process.env.FEATURE_IDENTITY = 'true';
      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:not-found');
    });
  });
});
