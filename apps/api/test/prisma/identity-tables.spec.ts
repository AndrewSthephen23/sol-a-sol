import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valores obviamente falsos: el hash real (argon2id) llega con la tarea 03 de H2.
const FAKE_HASH = 'fake';
const EXPIRES_AT = new Date('2026-12-21T15:00:00.000Z');

describe('identity tables (tokens and audit log)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(email: string) {
    return prisma.user.create({ data: { email, passwordHash: FAKE_HASH } });
  }

  describe('personal_access_tokens', () => {
    it('creates a token with scopes and an expiry, but no revocation or use yet', async () => {
      const user = await createUser('tokens-nuevo@example.com');

      const token = await prisma.personalAccessToken.create({
        data: {
          userId: user.id,
          name: 'iPhone',
          tokenHash: FAKE_HASH,
          scopes: ['captures:write'],
          expiresAt: EXPIRES_AT,
        },
      });

      expect(token.id).toMatch(UUID_V7);
      expect(token).toMatchObject({
        userId: user.id,
        name: 'iPhone',
        scopes: ['captures:write'],
        lastUsedAt: null,
        expiresAt: EXPIRES_AT,
        revokedAt: null,
      });
      expect(token.createdAt).toBeInstanceOf(Date);
    });

    // Un token siempre caduca: la base lo exige aunque alguien se salte la aplicación.
    it('rejects a token without an expiry', async () => {
      const user = await createUser('tokens-eternos@example.com');

      await expect(
        prisma.$executeRaw`
          INSERT INTO personal_access_tokens (id, user_id, name, token_hash, scopes)
          VALUES (gen_random_uuid(), ${user.id}::uuid, 'eterno', ${FAKE_HASH}, ARRAY['captures:write'])
        `,
      ).rejects.toThrow(/expires_at/);
    });

    it('rejects a token whose user does not exist', async () => {
      await expect(
        prisma.personalAccessToken.create({
          data: {
            userId: '01999999-9999-7999-8999-999999999999',
            name: 'fantasma',
            tokenHash: FAKE_HASH,
            scopes: [],
            expiresAt: EXPIRES_AT,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('deletes the tokens when the user is deleted (onDelete: Cascade)', async () => {
      const user = await createUser('tokens-cascada@example.com');
      await prisma.personalAccessToken.create({
        data: {
          userId: user.id,
          name: 'Android',
          tokenHash: FAKE_HASH,
          scopes: ['captures:write'],
          expiresAt: EXPIRES_AT,
        },
      });

      await prisma.user.delete({ where: { id: user.id } });

      await expect(prisma.personalAccessToken.count({ where: { userId: user.id } })).resolves.toBe(
        0,
      );
    });
  });

  describe('audit_logs', () => {
    it('records an attempt with no known user (a login against an unknown email)', async () => {
      const entry = await prisma.auditLog.create({
        data: { action: 'login.failed', entity: 'user', ip: '203.0.113.7', userAgent: 'curl' },
      });

      expect(entry.id).toMatch(UUID_V7);
      expect(entry).toMatchObject({ userId: null, entityId: null });
      expect(entry.at).toBeInstanceOf(Date);
    });

    // La bitácora es a propósito independiente de `users`: un hecho de seguridad debe sobrevivir
    // al borrado de quien lo provocó. Si alguien agrega una clave foránea, esta prueba falla.
    it('survives the deletion of the user it refers to, keeping who did it', async () => {
      const user = await createUser('auditoria@example.com');
      const entry = await prisma.auditLog.create({
        data: { userId: user.id, action: 'token.revoked', entity: 'personal_access_token' },
      });

      await prisma.user.delete({ where: { id: user.id } });

      await expect(prisma.auditLog.findUnique({ where: { id: entry.id } })).resolves.toMatchObject({
        userId: user.id,
        action: 'token.revoked',
      });
    });
  });
});
