import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const PASSWORD = `/${API_PREFIX}/auth/password`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
const IPHONE = { name: 'iPhone', scopes: ['captures:write'] };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

/** Todas las rutas que exigen una sesión, con un cuerpo que sería válido. */
const PROTECTED = [
  ['GET', TOKENS, {}],
  ['POST', TOKENS, IPHONE],
  ['DELETE', `${TOKENS}/01999999-9999-7999-8999-999999999999`, {}],
  ['POST', PASSWORD, { currentPassword: ANA.password, newPassword: 'otra frase larguísima' }],
  ['POST', `/${API_PREFIX}/auth/2fa/setup`, {}],
  ['POST', `/${API_PREFIX}/auth/2fa/verify`, { code: '123456' }],
  ['POST', `/${API_PREFIX}/auth/2fa/recovery-codes`, { code: '123456' }],
  ['POST', `/${API_PREFIX}/auth/2fa/disable`, { code: '123456' }],
] as const;

/**
 * Aislamiento por usuario, endpoint por endpoint: lo que la tarea de cierre de H2 exige de
 * cada ruta. Dos preguntas para cada una: ¿entra alguien sin sesión?, ¿puede una cuenta tocar
 * lo de otra?
 */
describe('user isolation', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = TOTP_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.loginThrottle.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    ana = await sessionOf(ANA);
    bruno = await sessionOf(BRUNO);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.loginThrottle.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  function call(method: string, path: string, body: object, token?: string) {
    const pending = request(server)[method.toLowerCase() as 'post'](path).send(body);

    return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
  }

  describe('without a session', () => {
    it.each(PROTECTED)('%s %s answers 401', async (method, path, body) => {
      const response = await call(method, path, body).expect(401);

      expect((response.body as ProblemDetails).status).toBe(401);
    });

    it.each(PROTECTED)('%s %s answers 401 with a made-up token', async (method, path, body) => {
      await call(method, path, body, 'eyJhbGciOiJIUzI1NiJ9.e30.inventada').expect(401);
    });
  });

  describe('with somebody else’s session', () => {
    it('never lists the tokens of another account', async () => {
      await call('POST', TOKENS, IPHONE, ana).expect(201);

      const response = await call('GET', TOKENS, {}, bruno).expect(200);

      expect(response.body).toEqual([]);
    });

    it('cannot revoke a token of another account, and it keeps working', async () => {
      const created = await call('POST', TOKENS, IPHONE, ana).expect(201);
      const { id } = created.body as { id: string };

      const response = await call('DELETE', `${TOKENS}/${id}`, {}, bruno).expect(404);

      expect((response.body as ProblemDetails).type).toBe(
        problemType('PERSONAL_ACCESS_TOKEN_NOT_FOUND'),
      );
      const row = await prisma.personalAccessToken.findUniqueOrThrow({ where: { id } });
      expect(row.revokedAt).toBeNull();
    });

    it('creates the token for whoever is signed in, never for the account in the body', async () => {
      const anaId = (await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } })).id;

      const created = await call('POST', TOKENS, { ...IPHONE, userId: anaId }, bruno).expect(201);

      const row = await prisma.personalAccessToken.findUniqueOrThrow({
        where: { id: (created.body as { id: string }).id },
      });
      expect(row.userId).not.toBe(anaId);
    });

    it('changes the password of whoever is signed in, never another one', async () => {
      await call(
        'POST',
        PASSWORD,
        { currentPassword: BRUNO.password, newPassword: 'una frase nueva y larga' },
        bruno,
      ).expect(200);

      await request(server).post(LOGIN).send(ANA).expect(200);
    });

    // La contraseña de otra cuenta no abre la propia: lo que se comprueba es la de su dueño.
    it('does not accept another account’s password as the current one', async () => {
      await call(
        'POST',
        PASSWORD,
        { currentPassword: ANA.password, newPassword: 'una frase nueva y larga' },
        bruno,
      ).expect(403);
    });

    it('sets up the second factor for whoever is signed in, not for anybody else', async () => {
      await call('POST', `/${API_PREFIX}/auth/2fa/setup`, {}, bruno).expect(200);

      const anaRow = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      expect(anaRow.totpSecret).toBeNull();
    });

    it('cannot close the sessions of another account', async () => {
      await call(
        'POST',
        PASSWORD,
        { currentPassword: BRUNO.password, newPassword: 'una frase nueva y larga' },
        bruno,
      ).expect(200);

      await call('GET', TOKENS, {}, ana).expect(200);
    });
  });
});
