import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { REFRESH_COOKIE } from '../../src/modules/identity/http/refresh-cookie.js';
import { type ProblemDetails } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const REFRESH = `/${API_PREFIX}/auth/refresh`;
const LOGOUT = `/${API_PREFIX}/auth/logout`;
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
// Obviamente falsa y de 34 caracteres: no es la clave de ningún entorno real.
const SECRET = 'clave-de-prueba-no-real-0123456789';

/** La cabecera `Set-Cookie` del refresco, tal cual la manda la API. */
function refreshCookieHeader(response: request.Response): string {
  const headers = response.headers['set-cookie'] as unknown as string[] | undefined;

  return (headers ?? []).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`)) ?? '';
}

function cookieValue(header: string): string {
  return header.slice(header.indexOf('=') + 1, header.indexOf(';'));
}

describe('session lifecycle', () => {
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
    // La bitácora no tiene clave foránea a propósito, así que sobrevive al borrado de usuarios:
    // hay que limpiarla aparte o una prueba ve las entradas de la anterior.
    await prisma.auditLog.deleteMany();
    process.env.REGISTRATION_MODE = 'closed';
    await request(server).post(REGISTER).send(CREDENTIALS).expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.loginThrottle.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    await app.close();
  });

  async function signIn(): Promise<string> {
    const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(200);

    return refreshCookieHeader(response);
  }

  describe('the cookie the session travels in', () => {
    it('is set when signing in', async () => {
      expect(await signIn()).not.toBe('');
    });

    it('cannot be read by JavaScript, only travels over HTTPS and never leaves the site', async () => {
      const cookie = await signIn();

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('is only sent to the session endpoints', async () => {
      expect(await signIn()).toContain('Path=/api/v1/auth');
    });

    it('carries a value that is nowhere in the database', async () => {
      const value = cookieValue(await signIn());
      const stored = await prisma.refreshToken.findMany();

      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).not.toBe(value);
      expect(stored[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('refreshing', () => {
    it('hands out a new access token without asking for the password', async () => {
      const cookie = await signIn();

      const response = await request(server).post(REFRESH).set('Cookie', cookie).expect(200);

      expect(response.body).toMatchObject({ tokenType: 'Bearer' });
    });

    it('replaces the cookie with a different one', async () => {
      const first = await signIn();

      const response = await request(server).post(REFRESH).set('Cookie', first).expect(200);

      expect(cookieValue(refreshCookieHeader(response))).not.toBe(cookieValue(first));
    });

    it('refuses a request with no cookie at all', async () => {
      const response = await request(server).post(REFRESH).expect(401);

      expect((response.body as ProblemDetails).type).toBe(
        'urn:sol-a-sol:error:invalid-refresh-token',
      );
    });

    it('refuses a token nobody issued', async () => {
      await request(server).post(REFRESH).set('Cookie', `${REFRESH_COOKIE}=inventado`).expect(401);
    });

    it('lets a session be refreshed again and again', async () => {
      let cookie = await signIn();

      for (let round = 0; round < 3; round++) {
        const response = await request(server).post(REFRESH).set('Cookie', cookie).expect(200);
        cookie = refreshCookieHeader(response);
      }

      expect(cookie).not.toBe('');
    });
  });

  describe('when a refresh token is used twice', () => {
    it('refuses the second attempt', async () => {
      const cookie = await signIn();
      await request(server).post(REFRESH).set('Cookie', cookie).expect(200);

      await request(server).post(REFRESH).set('Cookie', cookie).expect(401);
    });

    // Es la señal clásica de un token robado: no se sabe quién es quién, así que se echa a los dos.
    it('closes every session of the account, including the newest one', async () => {
      const first = await signIn();
      const second = refreshCookieHeader(
        await request(server).post(REFRESH).set('Cookie', first).expect(200),
      );

      await request(server).post(REFRESH).set('Cookie', first).expect(401);

      await request(server).post(REFRESH).set('Cookie', second).expect(401);
      const alive = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(alive).toBe(0);
    });

    it('writes it down in the audit log, without the token', async () => {
      const cookie = await signIn();
      await request(server).post(REFRESH).set('Cookie', cookie).expect(200);
      await request(server).post(REFRESH).set('Cookie', cookie).expect(401);

      const entries = await prisma.auditLog.findMany({ where: { action: 'refresh_token.reused' } });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.entity).toBe('refresh_token');
      expect(entries[0]?.userId).not.toBeNull();
      expect(JSON.stringify(entries)).not.toContain(cookieValue(cookie));
    });
  });

  describe('logging out', () => {
    it('answers 204 and clears the cookie', async () => {
      const cookie = await signIn();

      const response = await request(server).post(LOGOUT).set('Cookie', cookie).expect(204);

      expect(refreshCookieHeader(response)).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('leaves the session unusable', async () => {
      const cookie = await signIn();
      await request(server).post(LOGOUT).set('Cookie', cookie).expect(204);

      await request(server).post(REFRESH).set('Cookie', cookie).expect(401);
    });

    it('does not complain when there is no session to close', async () => {
      await request(server).post(LOGOUT).expect(204);
    });

    it('does not tell whether the token it was given existed', async () => {
      const real = await signIn();
      const withReal = await request(server).post(LOGOUT).set('Cookie', real).expect(204);
      const withFake = await request(server)
        .post(LOGOUT)
        .set('Cookie', `${REFRESH_COOKIE}=inventado`)
        .expect(204);

      expect(withFake.body).toEqual(withReal.body);
    });

    it('closes only that session, not the others of the account', async () => {
      const laptop = await signIn();
      const phone = await signIn();

      await request(server).post(LOGOUT).set('Cookie', laptop).expect(204);

      await request(server).post(REFRESH).set('Cookie', phone).expect(200);
    });
  });
});
