import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { REFRESH_COOKIE } from '../../src/modules/identity/http/refresh-cookie.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const REFRESH = `/${API_PREFIX}/auth/refresh`;
const PASSWORD = `/${API_PREFIX}/auth/password`;
const TOKENS = `/${API_PREFIX}/tokens`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
const NEW_PASSWORD = 'una frase nueva y bastante larga';
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface Browser {
  accessToken: string;
  cookie: string;
}

interface Notice {
  otherSessionsClosed: number;
  personalAccessTokens: { id: string; name: string }[];
}

function refreshCookieOf(response: request.Response): string {
  const headers = response.headers['set-cookie'] as unknown as string[] | undefined;

  return (headers ?? []).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`)) ?? '';
}

describe('changing the password', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

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
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  /** Un navegador con la sesión abierta: su token de acceso y su cookie de refresco. */
  async function signIn(credentials: typeof ANA = ANA): Promise<Browser> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return {
      accessToken: (response.body as { accessToken: string }).accessToken,
      cookie: refreshCookieOf(response),
    };
  }

  function change(browser: Browser, body: object): request.Test {
    return request(server)
      .post(PASSWORD)
      .set('Authorization', `Bearer ${browser.accessToken}`)
      .set('Cookie', browser.cookie)
      .send(body);
  }

  const VALID = { currentPassword: ANA.password, newPassword: NEW_PASSWORD };

  it('lets the owner in with the new password and not with the old one', async () => {
    await change(await signIn(), VALID).expect(200);

    await request(server)
      .post(LOGIN)
      .send({ ...ANA, password: NEW_PASSWORD })
      .expect(200);
    await request(server).post(LOGIN).send(ANA).expect(401);
  });

  it('closes the sessions of the other browsers', async () => {
    const laptop = await signIn();
    const desktop = await signIn();

    const response = await change(laptop, VALID).expect(200);

    expect((response.body as Notice).otherSessionsClosed).toBe(1);
    await request(server).post(REFRESH).set('Cookie', desktop.cookie).expect(401);
  });

  it('keeps the session it was changed from', async () => {
    const laptop = await signIn();

    await change(laptop, VALID).expect(200);

    await request(server).post(REFRESH).set('Cookie', laptop.cookie).expect(200);
  });

  // Decisión 7: la captura desde el celular no se rompe en silencio; se avisa y se ofrece.
  it('keeps the personal tokens working and lists them in the answer', async () => {
    const laptop = await signIn();
    const created = await request(server)
      .post(TOKENS)
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .send({ name: 'iPhone', scopes: ['captures:write'] })
      .expect(201);

    const response = await change(laptop, VALID).expect(200);

    expect((response.body as Notice).personalAccessTokens).toEqual([
      expect.objectContaining({ id: (created.body as { id: string }).id, name: 'iPhone' }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain((created.body as { token: string }).token);
    const row = await prisma.personalAccessToken.findFirstOrThrow();
    expect(row.revokedAt).toBeNull();
  });

  it('refuses a wrong current password with 403, and keeps the old one', async () => {
    const laptop = await signIn();

    const response = await change(laptop, { ...VALID, currentPassword: 'no es la mía, no' }).expect(
      403,
    );

    expect((response.body as ProblemDetails).type).toBe(problemType('CURRENT_PASSWORD_INCORRECT'));
    await request(server).post(LOGIN).send(ANA).expect(200);
  });

  it('applies the password policy to the new one', async () => {
    const response = await change(await signIn(), { ...VALID, newPassword: 'corta' }).expect(422);

    expect((response.body as ProblemDetails).type).toBe(problemType('PASSWORD_TOO_SHORT'));
  });

  it('records the change, without any password', async () => {
    await change(await signIn(), VALID).expect(200);

    const entries = await prisma.auditLog.findMany({ where: { action: 'password.changed' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ip).toBeTruthy();
    expect(JSON.stringify(entries)).not.toContain(NEW_PASSWORD);
  });

  it('requires a session', async () => {
    await request(server).post(PASSWORD).send(VALID).expect(401);
  });

  // Anti-IDOR: el cambio es siempre sobre la cuenta del token, nunca sobre otra.
  it('only ever changes the password of whoever is signed in', async () => {
    await change(await signIn(BRUNO), {
      currentPassword: BRUNO.password,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    await request(server).post(LOGIN).send(ANA).expect(200);
  });
});
