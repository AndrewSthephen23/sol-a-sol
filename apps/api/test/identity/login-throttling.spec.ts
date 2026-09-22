import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Clock } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { PurgeSecurityLogs } from '../../src/modules/identity/application/purge-security-logs.js';
import { type ProblemDetails, problemType } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const TOKENS = `/${API_PREFIX}/tokens`;
const ANA = { email: 'ana@example.com', password: 'caballo grapa batería' };
const WRONG = { ...ANA, password: 'no es la mía, para nada' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

/** Reloj que se puede mover, para ver caducar un bloqueo sin esperar un minuto. */
class TestClock implements Clock {
  instant = new Date('2026-09-22T15:00:00.000Z');

  now(): Date {
    return new Date(this.instant.getTime());
  }

  advanceMinutes(minutes: number): void {
    this.instant = new Date(this.instant.getTime() + minutes * 60 * 1000);
  }
}

describe('login throttling and the audit log', () => {
  const clock = new TestClock();
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    process.env.AUTH_JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = TOTP_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    await prisma.auditLog.deleteMany();
    await prisma.loginThrottle.deleteMany();
    clock.instant = new Date('2026-09-22T15:00:00.000Z');
    process.env.REGISTRATION_MODE = 'open';
    await request(server).post(REGISTER).send(ANA).expect(201);
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

  async function failTimes(times: number, credentials: object = WRONG): Promise<void> {
    for (let attempt = 0; attempt < times; attempt++) {
      await request(server).post(LOGIN).send(credentials).expect(401);
    }
  }

  async function actions(): Promise<string[]> {
    const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => row.action);
  }

  describe('the progressive lock', () => {
    it('answers 429 from the sixth attempt', async () => {
      await failTimes(5);

      const response = await request(server).post(LOGIN).send(WRONG).expect(429);

      expect((response.body as ProblemDetails).type).toBe(problemType('TOO_MANY_LOGIN_ATTEMPTS'));
    });

    it('says how long to wait in Retry-After', async () => {
      await failTimes(5);

      const response = await request(server).post(LOGIN).send(WRONG).expect(429);

      expect(response.headers['retry-after']).toBe('60');
    });

    // Aunque la contraseña sea la buena: el bloqueo va antes de mirarla.
    it('turns away even the right password while it lasts', async () => {
      await failTimes(5);

      await request(server).post(LOGIN).send(ANA).expect(429);
    });

    it('lets the owner in again once the minute is over', async () => {
      await failTimes(5);
      clock.advanceMinutes(1);

      await request(server).post(LOGIN).send(ANA).expect(200);
    });

    it('doubles the lock on the next failure, up to fifteen minutes', async () => {
      await failTimes(5);
      clock.advanceMinutes(1);
      await failTimes(1);

      const response = await request(server).post(LOGIN).send(WRONG).expect(429);

      expect(response.headers['retry-after']).toBe('120');
    });

    it('starts the count again after signing in correctly', async () => {
      await failTimes(4);

      await request(server).post(LOGIN).send(ANA).expect(200);

      await expect(prisma.loginThrottle.count()).resolves.toBe(0);
      await failTimes(4);
      await request(server).post(LOGIN).send(ANA).expect(200);
    });

    // Anti-enumeración: un correo sin cuenta se bloquea igual y responde lo mismo.
    it('blocks an email with no account just the same', async () => {
      const unknown = { email: 'nadie@example.com', password: 'una contraseña larga' };
      await failTimes(5, unknown);

      const response = await request(server).post(LOGIN).send(unknown).expect(429);

      const forTheRealAccount = await request(server).post(LOGIN).send(WRONG).expect(429);
      expect((response.body as ProblemDetails).detail).toBe(
        (forTheRealAccount.body as ProblemDetails).detail,
      );
    });

    it('never keeps the email in the clear', async () => {
      await failTimes(1);

      const rows = await prisma.loginThrottle.findMany();
      expect(rows.map((row) => row.key.split(':')[0]).sort()).toEqual(['email', 'ip']);
      expect(JSON.stringify(rows)).not.toContain(ANA.email);
    });
  });

  describe('the audit log', () => {
    it('records a successful sign-in with its user and origin', async () => {
      await request(server).post(LOGIN).send(ANA).expect(200);

      const [entry] = await prisma.auditLog.findMany({ where: { action: 'login.succeeded' } });
      const ana = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      expect(entry).toMatchObject({ userId: ana.id, entity: 'user' });
      expect(entry?.ip).toBeTruthy();
    });

    it('records each failure, and the one that locks as such', async () => {
      await failTimes(5);

      expect(await actions()).toEqual([
        'login.failed',
        'login.failed',
        'login.failed',
        'login.failed',
        'login.locked',
      ]);
    });

    it('never stores the email or the password', async () => {
      await failTimes(1);
      await request(server).post(LOGIN).send(ANA).expect(200);

      const entries = await prisma.auditLog.findMany();
      expect(JSON.stringify(entries)).not.toContain(ANA.email);
      expect(JSON.stringify(entries)).not.toContain(ANA.password);
    });

    it('has no user to point at when the email does not exist', async () => {
      await failTimes(1, { email: 'nadie@example.com', password: 'una contraseña larga' });

      const [entry] = await prisma.auditLog.findMany();
      expect(entry?.userId).toBeNull();
      expect(entry?.ip).toBeTruthy();
    });
  });

  describe('keeping only what is worth keeping', () => {
    it('deletes audit entries older than a year and forgotten attempts', async () => {
      await failTimes(1);
      const ana = await prisma.user.findUniqueOrThrow({ where: { email: ANA.email } });
      await prisma.auditLog.create({
        data: {
          userId: ana.id,
          action: 'login.succeeded',
          entity: 'user',
          at: new Date('2025-09-01T00:00:00.000Z'),
        },
      });

      // Un minuto más del día que se recuerdan los fallos: a las 24 h justas todavía no es
      // "más vieja que" el corte.
      clock.advanceMinutes(24 * 60 + 1);
      const purged = await app.get(PurgeSecurityLogs).execute();

      expect(purged).toEqual({ auditEntries: 1, loginAttempts: 2 });
      await expect(prisma.loginThrottle.count()).resolves.toBe(0);
      expect(await actions()).toEqual(['login.failed']);
    });
  });

  describe('the rate limit', () => {
    it('does not apply to the health checks', async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        await request(server).get('/health').expect(200);
      }
    });

    it('lets the rest of the API through at its own pace', async () => {
      const { accessToken } = (await request(server).post(LOGIN).send(ANA).expect(200)).body as {
        accessToken: string;
      };

      for (let attempt = 0; attempt < 25; attempt++) {
        await request(server).get(TOKENS).set('Authorization', `Bearer ${accessToken}`).expect(200);
      }
    });
  });
});
