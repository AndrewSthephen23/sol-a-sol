import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Clock, TOTP_PERIOD_SECONDS } from '@sol-a-sol/domain';
import { Secret, TOTP as Generator } from 'otpauth';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { type ProblemDetails } from '../../src/shared/http/problem-details.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { CLOCK } from '../../src/shared/time/system-clock.js';

const REGISTER = `/${API_PREFIX}/auth/register`;
const LOGIN = `/${API_PREFIX}/auth/login`;
const SETUP = `/${API_PREFIX}/auth/2fa/setup`;
const VERIFY = `/${API_PREFIX}/auth/2fa/verify`;
const DISABLE = `/${API_PREFIX}/auth/2fa/disable`;
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
// Valores obviamente falsos, solo para estas pruebas.
const JWT_SECRET = 'clave-de-prueba-no-real-0123456789';
const TOTP_KEY = Buffer.alloc(32, 7).toString('base64');

interface TokenResponse {
  accessToken: string;
}

/**
 * Reloj que se puede mover a mano.
 *
 * Hace falta porque un código TOTP sirve **una sola vez** y la ventana acepta un periodo a cada
 * lado: dentro del mismo periodo solo hay dos códigos utilizables. En la vida real entre
 * activar el segundo factor y desactivarlo pasan minutos; aquí pasan milisegundos, así que el
 * tiempo se adelanta a propósito.
 */
class TestClock implements Clock {
  private instant = new Date('2026-09-21T12:00:00.000Z');

  now(): Date {
    return new Date(this.instant.getTime());
  }

  advancePeriods(periods: number): void {
    this.instant = new Date(this.instant.getTime() + periods * TOTP_PERIOD_SECONDS * 1000);
  }
}

const clock = new TestClock();

/** El código que mostraría la aplicación de autenticación ahora mismo. */
function codeFor(secret: string): string {
  const generator = new Generator({
    secret: Secret.fromBase32(secret),
    period: TOTP_PERIOD_SECONDS,
  });

  return generator.generate({ timestamp: clock.now().getTime() });
}

describe('two factor authentication', () => {
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
    process.env.REGISTRATION_MODE = 'closed';
    clock.advancePeriods(10);
    await request(server).post(REGISTER).send(CREDENTIALS).expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.FEATURE_IDENTITY;
    delete process.env.REGISTRATION_MODE;
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    await app.close();
  });

  async function accessToken(totpCode?: string): Promise<string> {
    const response = await request(server)
      .post(LOGIN)
      .send({ ...CREDENTIALS, ...(totpCode === undefined ? {} : { totpCode }) })
      .expect(200);

    return (response.body as TokenResponse).accessToken;
  }

  async function enable(): Promise<string> {
    const token = await accessToken();
    const setup = await request(server)
      .post(SETUP)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const secret = (setup.body as { secret: string }).secret;

    await request(server)
      .post(VERIFY)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: codeFor(secret) })
      .expect(204);

    return secret;
  }

  describe('setting it up', () => {
    it('hands out a scannable otpauth URI', async () => {
      const token = await accessToken();

      const response = await request(server)
        .post(SETUP)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((response.body as { uri: string }).uri.startsWith('otpauth://totp/')).toBe(true);
    });

    it('does not turn it on until a code confirms it', async () => {
      const token = await accessToken();
      await request(server).post(SETUP).set('Authorization', `Bearer ${token}`).expect(200);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } });
      expect(stored.totpSecret).not.toBeNull();
      expect(stored.totpConfirmedAt).toBeNull();
      await request(server).post(LOGIN).send(CREDENTIALS).expect(200);
    });

    it('stores the secret encrypted, never in the clear', async () => {
      const token = await accessToken();
      const setup = await request(server)
        .post(SETUP)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } });
      expect(stored.totpSecret).not.toBe((setup.body as { secret: string }).secret);
      expect(stored.totpSecret).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it('needs a valid access token', async () => {
      await request(server).post(SETUP).expect(401);
      await request(server).post(SETUP).set('Authorization', 'Bearer inventado').expect(401);
    });

    it('refuses to start again while it is already on', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const token = await accessToken(codeFor(secret));

      await request(server).post(SETUP).set('Authorization', `Bearer ${token}`).expect(409);
    });
  });

  describe('signing in once it is on', () => {
    it('asks for a code when none is given', async () => {
      await enable();

      const response = await request(server).post(LOGIN).send(CREDENTIALS).expect(401);

      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:totp-required');
    });

    it('lets a valid code through', async () => {
      const secret = await enable();
      clock.advancePeriods(1);

      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, totpCode: codeFor(secret) })
        .expect(200);
    });

    it('rejects a wrong code', async () => {
      await enable();

      const response = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, totpCode: '000000' })
        .expect(401);

      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:invalid-totp-code');
    });

    it('still rejects a wrong password, code or no code', async () => {
      const secret = await enable();
      clock.advancePeriods(1);

      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, password: 'otra contraseña larga', totpCode: codeFor(secret) })
        .expect(401);
    });

    // Quien ve el código por encima del hombro no puede usarlo en los segundos que le quedan.
    it('refuses the same code a second time', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const code = codeFor(secret);
      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, totpCode: code })
        .expect(200);

      await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, totpCode: code })
        .expect(401);
    });

    it('rejects a code that is not six digits, before checking anything', async () => {
      await enable();

      const response = await request(server)
        .post(LOGIN)
        .send({ ...CREDENTIALS, totpCode: '12345' })
        .expect(401);

      expect((response.body as ProblemDetails).type).toBe('urn:sol-a-sol:error:invalid-totp-code');
    });
  });

  describe('turning it off', () => {
    it('needs a valid code, because it is a step down in security', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const token = await accessToken(codeFor(secret));

      await request(server)
        .post(DISABLE)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' })
        .expect(401);
    });

    it('leaves the account signing in with just a password again', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const token = await accessToken(codeFor(secret));
      clock.advancePeriods(1);

      await request(server)
        .post(DISABLE)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: codeFor(secret) })
        .expect(204);

      await request(server).post(LOGIN).send(CREDENTIALS).expect(200);
    });

    it('forgets the secret entirely', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const token = await accessToken(codeFor(secret));
      clock.advancePeriods(1);
      await request(server)
        .post(DISABLE)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: codeFor(secret) })
        .expect(204);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } });
      expect(stored.totpSecret).toBeNull();
      expect(stored.totpConfirmedAt).toBeNull();
    });
  });

  describe('the audit log', () => {
    it('records turning it on and off', async () => {
      const secret = await enable();
      clock.advancePeriods(1);
      const token = await accessToken(codeFor(secret));
      clock.advancePeriods(1);
      await request(server)
        .post(DISABLE)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: codeFor(secret) })
        .expect(204);

      const actions = (await prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map(
        (e) => e.action,
      );
      expect(actions).toEqual(['totp.enabled', 'totp.disabled']);
    });

    it('never writes the secret down', async () => {
      const secret = await enable();

      const entries = await prisma.auditLog.findMany();
      expect(JSON.stringify(entries)).not.toContain(secret);
    });
  });
});
