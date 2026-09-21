import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidCredentialsError } from '../domain/errors.js';
import type { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserCredentials, UserRepository } from '../ports/user-repository.js';
import { LoginUser } from './login-user.js';

const USER: UserCredentials = { id: 'user-1', passwordHash: 'hash-real' };
const DECOY = 'hash-senuelo';
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };

describe('LoginUser', () => {
  let verify: ReturnType<typeof vi.fn<(plain: string, hash: string) => Promise<boolean>>>;
  let found: UserCredentials | null;
  let loginUser: LoginUser;

  beforeEach(() => {
    found = USER;
    verify = vi.fn(() => Promise.resolve(true));

    const users: UserRepository = {
      hasAnyUser: () => Promise.resolve(true),
      findCredentialsByEmail: () => Promise.resolve(found),
      create: () => Promise.reject(new Error('no se usa aquí')),
    };
    const passwords: PasswordHasher = { hash: () => Promise.resolve('x'), verify };
    const decoy = { get: () => DECOY } as DecoyPasswordHash;

    loginUser = new LoginUser(users, passwords, decoy);
  });

  it('says which account the right password belongs to', async () => {
    await expect(loginUser.execute(CREDENTIALS)).resolves.toBe(USER.id);
  });

  it('rejects a wrong password', async () => {
    verify.mockResolvedValue(false);

    await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects an unknown email', async () => {
    found = null;

    await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow(InvalidCredentialsError);
  });

  describe('not telling which of the two failed', () => {
    it('answers a wrong password and an unknown email with the very same error', async () => {
      verify.mockResolvedValue(false);
      const wrongPassword = await loginUser.execute(CREDENTIALS).catch((error: unknown) => error);

      found = null;
      verify.mockResolvedValue(true);
      const unknownEmail = await loginUser.execute(CREDENTIALS).catch((error: unknown) => error);

      expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
      expect((wrongPassword as InvalidCredentialsError).code).toBe(
        (unknownEmail as InvalidCredentialsError).code,
      );
    });

    // Es la defensa contra enumeración por tiempo: si el correo desconocido no hasheara nada,
    // respondería antes y cronometrando se sabría qué correos tienen cuenta.
    it('verifies against the decoy when the email does not exist, so both cost the same', async () => {
      found = null;

      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow();

      expect(verify).toHaveBeenCalledExactlyOnceWith(CREDENTIALS.password, DECOY);
    });

    it('verifies against the real hash when the account exists', async () => {
      await loginUser.execute(CREDENTIALS);

      expect(verify).toHaveBeenCalledExactlyOnceWith(CREDENTIALS.password, USER.passwordHash);
    });

    it('does exactly one verification either way', async () => {
      await loginUser.execute(CREDENTIALS);
      expect(verify).toHaveBeenCalledTimes(1);

      verify.mockClear();
      found = null;
      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow();
      expect(verify).toHaveBeenCalledTimes(1);
    });
  });
});
