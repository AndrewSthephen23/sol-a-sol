import type { Server } from 'node:http';

import { Controller, type INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Clock } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import {
  AcceptsPersonalAccessToken,
  AccessTokenGuard,
  CurrentUser,
  IdentityModule,
} from '../../src/modules/identity/index.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const SETUP_2FA = `/${API_PREFIX}/auth/2fa/setup`;
const PROBE = `/${API_PREFIX}/capture-probe`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const BRUNO = { email: 'bruno@example.com', password: 'otra frase bastante larga' };
const IPHONE = { name: 'iPhone', scopes: ['captures:write'] };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface CreatedToken {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string;
  lastUsedAt: string | null;
  token: string;
}

/**
 * Hace las veces del futuro módulo `capture`, que todavía no existe: una ruta que acepta
 * tokens personales con `captures:write`, protegida exactamente como lo estará la de verdad.
 */
@Controller('capture-probe')
@UseGuards(AccessTokenGuard)
class CaptureProbeController {
  @Post()
  @AcceptsPersonalAccessToken('captures:write')
  send(@CurrentUser() userId: string): { userId: string } {
    return { userId };
  }
}

/** Reloj que se puede mover, para ver caducar un token sin esperar noventa días. */
class TestClock implements Clock {
  instant = new Date('2026-09-22T15:00:00.000Z');

  now(): Date {
    return new Date(this.instant.getTime());
  }
}

describe('personal access tokens', () => {
  const clock = new TestClock();
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let anaSession: string;
  let brunoSession: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = TOTP_KEY;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, IdentityModule],
      controllers: [CaptureProbeController],
    })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
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
    clock.instant = new Date('2026-09-22T15:00:00.000Z');
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
    await request(server).post(REGISTER).send(BRUNO).expect(201);
    anaSession = await sessionOf(ANA);
    brunoSession = await sessionOf(BRUNO);
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

  async function sessionOf(credentials: typeof ANA): Promise<string> {
    const response = await request(server).post(LOGIN).send(credentials).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  async function createToken(session = anaSession, body: object = IPHONE): Promise<CreatedToken> {
    const response = await request(server)
      .post(TOKENS)
      .set('Authorization', `Bearer ${session}`)
      .send(body)
      .expect(201);

    return response.body as CreatedToken;
  }

  /** Solo lo que hicieron los tokens: los inicios de sesión se registran aparte. */
  async function actions(): Promise<string[]> {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'personal_access_token' },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.action);
  }

  describe('creating one', () => {
    it('shows the token once, with a ninety-day expiry by default', async () => {
      const created = await createToken();

      expect(created.token).toMatch(/^sas_pat_/);
      expect(created).toMatchObject({
        name: 'iPhone',
        scopes: ['captures:write'],
        lastUsedAt: null,
      });
      expect(created.expiresAt).toBe('2026-12-21T15:00:00.000Z');
    });

    it('keeps only the hash: the value is nowhere in the table', async () => {
      const created = await createToken();

      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM personal_access_tokens
      `;

      expect(rows).toHaveLength(1);
      const secret = created.token.slice(-43);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('records the creation with its origin, and nothing secret', async () => {
      const created = await createToken();

      const [entry] = await prisma.auditLog.findMany({
        where: { action: 'personal_access_token.created' },
      });
      expect(entry).toMatchObject({ entity: 'personal_access_token', entityId: created.id });
      expect(entry?.ip).toBeTruthy();
      expect(JSON.stringify(entry)).not.toContain(created.token.slice(-43));
    });

    it.each([
      [
        'an unknown scope',
        { name: 'iPhone', scopes: ['transactions:read'] },
        'UNKNOWN_TOKEN_SCOPE',
      ],
      ['no scopes at all', { name: 'iPhone', scopes: [] }, 'UNKNOWN_TOKEN_SCOPE'],
      ['a lifetime over a year', { ...IPHONE, expiresInDays: 366 }, 'INVALID_TOKEN_LIFETIME'],
      ['a lifetime of zero days', { ...IPHONE, expiresInDays: 0 }, 'INVALID_TOKEN_LIFETIME'],
      ['a blank name', { ...IPHONE, name: '  ' }, 'VALIDATION_FAILED'],
    ])('refuses %s with 422', async (_case, body, code) => {
      const response = await request(server)
        .post(TOKENS)
        .set('Authorization', `Bearer ${anaSession}`)
        .send(body)
        .expect(422);

      expect((response.body as ProblemDetails).type).toBe(problemType(code));
      await expect(prisma.personalAccessToken.count()).resolves.toBe(0);
    });

    it('requires a session', async () => {
      await request(server).post(TOKENS).send(IPHONE).expect(401);
    });
  });

  describe('listing them', () => {
    it('shows the tokens without their value', async () => {
      const created = await createToken();

      const response = await request(server)
        .get(TOKENS)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: created.id,
          name: 'iPhone',
          scopes: ['captures:write'],
          createdAt: expect.any(String) as unknown,
          expiresAt: created.expiresAt,
          lastUsedAt: null,
        },
      ]);
      expect(JSON.stringify(response.body)).not.toContain(created.token.slice(-43));
    });

    // Anti-IDOR: cada uno ve solo los suyos.
    it('never shows the tokens of another account', async () => {
      await createToken(anaSession);

      const response = await request(server)
        .get(TOKENS)
        .set('Authorization', `Bearer ${brunoSession}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('using one', () => {
    it('opens a route that accepts its scope, as its owner', async () => {
      const { token } = await createToken();

      const response = await request(server)
        .post(PROBE)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const ana = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      expect(response.body).toEqual({ userId: ana.id });
    });

    it('remembers when it was last used, and records the use', async () => {
      const created = await createToken();
      clock.instant = new Date('2026-10-01T09:30:00.000Z');

      await request(server).post(PROBE).set('Authorization', `Bearer ${created.token}`).expect(201);

      const row = await prisma.personalAccessToken.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.lastUsedAt).toEqual(new Date('2026-10-01T09:30:00.000Z'));
      expect(await actions()).toContain('personal_access_token.used');
    });

    // El token del celular no puede tocar la cuenta: ni sus tokens ni su segundo factor.
    it.each([
      ['list the tokens', 'get', TOKENS],
      ['create another token', 'post', TOKENS],
      ['set up the second factor', 'post', SETUP_2FA],
    ] as const)('cannot %s (403)', async (_case, method, path) => {
      const { token } = await createToken();

      const response = await request(server)
        [method](path)
        .set('Authorization', `Bearer ${token}`)
        .send(IPHONE)
        .expect(403);

      expect((response.body as ProblemDetails).type).toBe(problemType('INSUFFICIENT_TOKEN_SCOPE'));
      expect((await actions()).at(-1)).toBe('personal_access_token.rejected_scope');
    });

    it('stops working once revoked (401), and the attempt is recorded', async () => {
      const created = await createToken();
      await request(server)
        .delete(`${TOKENS}/${created.id}`)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(204);

      const response = await request(server)
        .post(PROBE)
        .set('Authorization', `Bearer ${created.token}`)
        .expect(401);

      expect((response.body as ProblemDetails).type).toBe(
        problemType('INVALID_PERSONAL_ACCESS_TOKEN'),
      );
      expect(await actions()).toEqual([
        'personal_access_token.created',
        'personal_access_token.revoked',
        'personal_access_token.rejected_revoked',
      ]);
    });

    it('stops working once expired (401), and the attempt is recorded', async () => {
      const created = await createToken(anaSession, { ...IPHONE, expiresInDays: 1 });
      clock.instant = new Date('2026-09-23T15:00:00.000Z');

      await request(server).post(PROBE).set('Authorization', `Bearer ${created.token}`).expect(401);

      expect((await actions()).at(-1)).toBe('personal_access_token.rejected_expired');
    });

    it('rejects a token with a forged secret (401)', async () => {
      const { token } = await createToken();
      const forged = `${token.slice(0, -4)}AAAA`;

      await request(server).post(PROBE).set('Authorization', `Bearer ${forged}`).expect(401);

      expect((await actions()).at(-1)).toBe('personal_access_token.rejected_secret');
    });
  });

  describe('revoking one', () => {
    it('takes it off the list', async () => {
      const created = await createToken();

      await request(server)
        .delete(`${TOKENS}/${created.id}`)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(204);

      const response = await request(server)
        .get(TOKENS)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    // Anti-IDOR: el token de otro responde igual que uno que no existe, y sigue funcionando.
    it('cannot revoke a token of another account (404), which keeps working', async () => {
      const created = await createToken(anaSession);

      const response = await request(server)
        .delete(`${TOKENS}/${created.id}`)
        .set('Authorization', `Bearer ${brunoSession}`)
        .expect(404);

      expect((response.body as ProblemDetails).type).toBe(
        problemType('PERSONAL_ACCESS_TOKEN_NOT_FOUND'),
      );
      await request(server).post(PROBE).set('Authorization', `Bearer ${created.token}`).expect(201);
    });

    it('answers 404 for an id that is not even a UUID', async () => {
      await request(server)
        .delete(`${TOKENS}/no-es-un-uuid`)
        .set('Authorization', `Bearer ${anaSession}`)
        .expect(404);
    });

    it('answers 404 the second time', async () => {
      const created = await createToken();
      const revoke = () =>
        request(server)
          .delete(`${TOKENS}/${created.id}`)
          .set('Authorization', `Bearer ${anaSession}`);

      await revoke().expect(204);
      await revoke().expect(404);
    });
  });
});
