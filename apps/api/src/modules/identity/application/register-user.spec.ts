import { PasswordTooShortError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasswordHasher } from '../ports/password-hasher.js';
import type { NewUser, UserAccount, UserRepository } from '../ports/user-repository.js';
import { RegisterUser } from './register-user.js';

const STRONG = 'caballo grapa batería';

function fakeRepository() {
  const created: NewUser[] = [];

  return {
    created,
    hasAnyUser: (): Promise<boolean> => Promise.resolve(false),
    findCredentialsByEmail: () => Promise.resolve(null),
    create: (user: NewUser): Promise<UserAccount> => {
      created.push(user);

      return Promise.resolve({
        id: '01999999-9999-7999-8999-999999999999',
        email: user.email,
        createdAt: new Date('2026-09-20T00:00:00.000Z'),
      });
    },
  } satisfies UserRepository & { created: NewUser[] };
}

describe('RegisterUser', () => {
  let repository: ReturnType<typeof fakeRepository>;
  let hash: ReturnType<typeof vi.fn<(plain: string) => Promise<string>>>;
  let registerUser: RegisterUser;

  beforeEach(() => {
    repository = fakeRepository();
    hash = vi.fn((plain: string) => Promise.resolve(`hashed:${plain}`));
    const hasher: PasswordHasher = { hash, verify: () => Promise.resolve(true) };
    registerUser = new RegisterUser(repository, hasher);
  });

  it('creates the account and returns only public data', async () => {
    const account = await registerUser.execute({ email: 'ana@example.com', password: STRONG });

    expect(account).toEqual({
      id: '01999999-9999-7999-8999-999999999999',
      email: 'ana@example.com',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    });
  });

  it('stores the hash, never the password', async () => {
    await registerUser.execute({ email: 'ana@example.com', password: STRONG });

    expect(repository.created).toEqual([
      { email: 'ana@example.com', passwordHash: `hashed:${STRONG}` },
    ]);
  });

  it('applies the domain password policy', async () => {
    await expect(
      registerUser.execute({ email: 'ana@example.com', password: 'corta' }),
    ).rejects.toThrow(PasswordTooShortError);
  });

  // Hashear cuesta 19 MiB y 35 ms: gastarlos en una contraseña que se va a rechazar haría
  // barato tumbar la API mandando registros inválidos en masa.
  it('rejects a weak password before spending anything on hashing', async () => {
    await expect(
      registerUser.execute({ email: 'ana@example.com', password: 'corta' }),
    ).rejects.toThrow();

    expect(hash).not.toHaveBeenCalled();
    expect(repository.created).toEqual([]);
  });
});
