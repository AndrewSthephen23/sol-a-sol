import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import {
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
} from '../../src/shared/http/problem-details.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
const INVITE = 'codigo-de-invitacion';

describe('POST /auth/register', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // El modo `closed` depende de que no exista ninguna cuenta, así que cada prueba parte de cero.
    await prisma.user.deleteMany();
    process.env.REGISTRATION_MODE = 'closed';
    delete process.env.REGISTRATION_INVITE_CODE;
  });

  afterAll(async () => {
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    await app.close();
  });

  describe('the happy path', () => {
    it('creates the first account and answers with public data only', async () => {
      const response = await request(server).post(REGISTER).send(CREDENTIALS).expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        email: 'ana@example.com',
        createdAt: expect.any(String) as string,
      });
    });

    it('never lets the password or its hash out', async () => {
      const response = await request(server).post(REGISTER).send(CREDENTIALS).expect(201);
      const body = JSON.stringify(response.body);

      expect(body).not.toContain(CREDENTIALS.password);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('$argon2id$');
      expect(body).not.toContain('totpSecret');
    });

    it('stores the password hashed with argon2id, never in clear', async () => {
      await request(server).post(REGISTER).send(CREDENTIALS).expect(201);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } });
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(stored.passwordHash).not.toContain(CREDENTIALS.password);
    });

    it('normalises the email before storing it', async () => {
      await request(server)
        .post(REGISTER)
        .send({ ...CREDENTIALS, email: '  Ana@Example.COM  ' })
        .expect(201);

      await expect(prisma.user.count({ where: { email: 'ana@example.com' } })).resolves.toBe(1);
    });
  });

  describe('when registration is closed', () => {
    it('turns the second person away with a plain 404', async () => {
      await request(server).post(REGISTER).send(CREDENTIALS).expect(201);

      const response = await request(server)
        .post(REGISTER)
        .send({ email: 'otra@example.com', password: CREDENTIALS.password })
        .expect(404);

      // Idéntico a una ruta inexistente: nada revela que el registro exista y esté cerrado.
      expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:not-found');
      expect(JSON.stringify(response.body)).not.toMatch(/regist/i);
    });

    it('does not create the account it just refused', async () => {
      await request(server).post(REGISTER).send(CREDENTIALS).expect(201);
      await request(server)
        .post(REGISTER)
        .send({ email: 'otra@example.com', password: CREDENTIALS.password })
        .expect(404);

      await expect(prisma.user.count()).resolves.toBe(1);
    });
  });

  describe('invite mode', () => {
    beforeEach(() => {
      process.env.REGISTRATION_MODE = 'invite';
      process.env.REGISTRATION_INVITE_CODE = INVITE;
    });

    it('accepts someone carrying the code', async () => {
      await request(server)
        .post(REGISTER)
        .send({ ...CREDENTIALS, inviteCode: INVITE })
        .expect(201);
    });

    it('turns away someone without it, with the same 404', async () => {
      await request(server).post(REGISTER).send(CREDENTIALS).expect(404);
    });
  });

  describe('when the input is wrong', () => {
    it('rejects an invalid email with 422 and a field error', async () => {
      const response = await request(server)
        .post(REGISTER)
        .send({ ...CREDENTIALS, email: 'no-es-correo' })
        .expect(422);

      expect((response.body as ProblemDetails).errors?.[0]?.field).toBe('email');
    });

    it('rejects a password the policy refuses, with its stable code', async () => {
      const response = await request(server)
        .post(REGISTER)
        .send({ ...CREDENTIALS, password: 'corta' })
        .expect(422);

      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:password-too-short');
    });

    it('never echoes the rejected password back', async () => {
      const response = await request(server)
        .post(REGISTER)
        .send({ ...CREDENTIALS, password: 'corta' })
        .expect(422);

      expect(JSON.stringify(response.body)).not.toContain('corta');
    });

    it('answers 409 when the email is taken, which only open registration can reach', async () => {
      process.env.REGISTRATION_MODE = 'open';
      await request(server).post(REGISTER).send(CREDENTIALS).expect(201);

      const response = await request(server).post(REGISTER).send(CREDENTIALS).expect(409);

      expect((response.body as ProblemDetails).type).toBe(
        'urn:sol-a-sol:error:email-already-registered',
      );
    });
  });

  describe('when the module is switched off', () => {
    afterEach(() => {
      process.env.FEATURE_IDENTITY = 'true';
    });

    it('answers 404, so the flag does not reveal that the module exists', async () => {
      process.env.FEATURE_IDENTITY = 'false';

      const response = await request(server).post(REGISTER).send(CREDENTIALS).expect(404);

      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:not-found');
      await expect(prisma.user.count()).resolves.toBe(0);
    });
  });
});
