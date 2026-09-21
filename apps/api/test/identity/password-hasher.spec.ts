import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import {
  IdentityModule,
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../src/modules/identity/index.js';

const PASSWORD = 'caballo grapa batería';

/**
 * Se resuelve por el token del puerto y desde la API pública del módulo, igual que lo hará el
 * caso de uso: comprueba el cableado y que el binario nativo de argon2 funciona de verdad.
 */
describe('PasswordHasher wired through the identity module', () => {
  let hasher: PasswordHasher;

  beforeAll(async () => {
    // El módulo trae ya su repositorio Prisma, que necesita la conexión aunque esta prueba
    // no consulte nada.
    process.env.DATABASE_URL = inject('databaseUrl');
    const moduleRef = await Test.createTestingModule({ imports: [IdentityModule] }).compile();
    hasher = moduleRef.get<PasswordHasher>(PASSWORD_HASHER);
  });

  it('hashes and verifies a round trip', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify(PASSWORD, hash)).resolves.toBe(true);
  });

  // Sin sal, dos cuentas con la misma contraseña compartirían hash y una tabla precalculada
  // las rompería a las dos de una vez.
  it('gives the same password two different hashes, because each one gets its own salt', async () => {
    const [first, second] = await Promise.all([hasher.hash(PASSWORD), hasher.hash(PASSWORD)]);

    expect(first).not.toBe(second);
    await expect(hasher.verify(PASSWORD, first)).resolves.toBe(true);
    await expect(hasher.verify(PASSWORD, second)).resolves.toBe(true);
  });

  it('does not accept one password against another password hash', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify('una contraseña distinta', hash)).resolves.toBe(false);
  });
});
