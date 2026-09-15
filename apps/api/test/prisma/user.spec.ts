import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { PrismaService } from '../../src/shared/prisma/prisma.service.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Valor obviamente falso: el hash real (argon2id) llega con el módulo identity en H2.
const FAKE_HASH = 'fake';

describe('users table (initial migration)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = inject('databaseUrl');
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user with a UUIDv7 id and Peruvian defaults', async () => {
    const user = await prisma.user.create({
      data: { email: 'ana@example.com', passwordHash: FAKE_HASH },
    });

    expect(user.id).toMatch(UUID_V7);
    expect(user).toMatchObject({
      email: 'ana@example.com',
      totpSecret: null,
      locale: 'es-PE',
      timezone: 'America/Lima',
    });
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a second user with the same email', async () => {
    const data = { email: 'duplicado@example.com', passwordHash: FAKE_HASH };
    await prisma.user.create({ data });

    await expect(prisma.user.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });
});
