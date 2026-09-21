import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvalidCredentialsError,
  InvalidTotpCodeError,
  TotpRequiredError,
} from '../domain/errors.js';
import type { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import type { SecretBox } from '../infrastructure/secret-box.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { Totp, TotpVerification } from '../ports/totp.js';
import { fakeCredentials, FakeUserRepository } from '../ports/user-repository.fake.js';
import { LoginUser } from './login-user.js';

const DECOY = 'hash-senuelo';
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
const SEALED = 'secreto-cifrado';
const CODE = '123456';

describe('LoginUser', () => {
  let users: FakeUserRepository;
  let verify: ReturnType<typeof vi.fn<(plain: string, hash: string) => Promise<boolean>>>;
  let verifyTotp: ReturnType<typeof vi.fn<(s: string, c: string) => TotpVerification | null>>;
  let loginUser: LoginUser;

  beforeEach(() => {
    users = new FakeUserRepository({ credentials: fakeCredentials() });
    verify = vi.fn(() => Promise.resolve(true));
    verifyTotp = vi.fn(() => ({ counter: 100 }));

    const passwords: PasswordHasher = { hash: () => Promise.resolve('x'), verify };
    const decoy = { get: () => DECOY } as DecoyPasswordHash;
    const totp: Totp = { enrol: () => ({ secret: 's', uri: 'u' }), verify: verifyTotp };
    const secrets = { open: () => 'secreto-en-claro', seal: () => SEALED } as unknown as SecretBox;

    loginUser = new LoginUser(users, passwords, decoy, totp, secrets);
  });

  describe('with only a password', () => {
    it('says which account the right password belongs to', async () => {
      await expect(loginUser.execute(CREDENTIALS)).resolves.toBe('user-1');
    });

    it('rejects a wrong password', async () => {
      verify.mockResolvedValue(false);

      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow(InvalidCredentialsError);
    });

    it('rejects an unknown email', async () => {
      users.credentials = null;

      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('not telling which of the two failed', () => {
    it('answers a wrong password and an unknown email with the very same error', async () => {
      verify.mockResolvedValue(false);
      const wrongPassword = await loginUser.execute(CREDENTIALS).catch((e: unknown) => e);

      users.credentials = null;
      verify.mockResolvedValue(true);
      const unknownEmail = await loginUser.execute(CREDENTIALS).catch((e: unknown) => e);

      expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
    });

    // Es la defensa contra enumeración por tiempo: si el correo desconocido no hasheara nada,
    // respondería antes y cronometrando se sabría qué correos tienen cuenta.
    it('verifies against the decoy when the email does not exist, so both cost the same', async () => {
      users.credentials = null;

      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow();

      expect(verify).toHaveBeenCalledExactlyOnceWith(CREDENTIALS.password, DECOY);
    });

    it('does exactly one verification either way', async () => {
      await loginUser.execute(CREDENTIALS);
      expect(verify).toHaveBeenCalledTimes(1);

      verify.mockClear();
      users.credentials = null;
      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow();
      expect(verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the account has a second factor', () => {
    beforeEach(() => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
    });

    it('lets the right code through', async () => {
      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: CODE })).resolves.toBe('user-1');
    });

    // Decirlo confirma que la contraseña era correcta. Es inevitable: sin eso no habría forma
    // de pedir el código, y es justo la razón de ser del segundo factor.
    it('asks for a code when none arrives', async () => {
      await expect(loginUser.execute(CREDENTIALS)).rejects.toThrow(TotpRequiredError);
    });

    it('asks for a code when an empty one arrives', async () => {
      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: '' })).rejects.toThrow(
        TotpRequiredError,
      );
    });

    it('rejects a code that matches no period', async () => {
      verifyTotp.mockReturnValue(null);

      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: CODE })).rejects.toThrow(
        InvalidTotpCodeError,
      );
    });

    it('writes down the period it used, so the code cannot serve twice', async () => {
      await loginUser.execute({ ...CREDENTIALS, totpCode: CODE });

      expect(users.recordedCounters).toEqual([{ userId: 'user-1', counter: 100 }]);
    });

    it('rejects a code from a period already spent', async () => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
        totpLastCounter: 100n,
      });

      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: CODE })).rejects.toThrow(
        InvalidTotpCodeError,
      );
    });

    it('accepts the next period after the one already spent', async () => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
        totpLastCounter: 99n,
      });

      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: CODE })).resolves.toBe('user-1');
    });

    it('checks the password before ever asking for a code', async () => {
      verify.mockResolvedValue(false);

      await expect(loginUser.execute({ ...CREDENTIALS, totpCode: CODE })).rejects.toThrow(
        InvalidCredentialsError,
      );
      expect(verifyTotp).not.toHaveBeenCalled();
    });
  });

  // El secreto existe pero nunca se confirmó: la cuenta sigue entrando solo con contraseña.
  it('does not ask for a code while the setup is unconfirmed', async () => {
    users.credentials = fakeCredentials({ totpSecret: SEALED, totpConfirmedAt: null });

    await expect(loginUser.execute(CREDENTIALS)).resolves.toBe('user-1');
  });
});
