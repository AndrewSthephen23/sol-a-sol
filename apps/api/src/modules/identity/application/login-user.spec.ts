import { FixedClock } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvalidCredentialsError,
  InvalidTotpCodeError,
  TooManyLoginAttemptsError,
  TotpRequiredError,
} from '../domain/errors.js';
import type { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import type { SecretBox } from '../infrastructure/secret-box.js';
import type { AuditEntry, AuditLogger } from '../ports/audit-logger.js';
import { FakeLoginThrottleRepository } from '../ports/login-throttle-repository.fake.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { Totp, TotpVerification } from '../ports/totp.js';
import { fakeCredentials, FakeUserRepository } from '../ports/user-repository.fake.js';
import { LoginThrottle } from './login-throttle.js';
import { LoginUser } from './login-user.js';
import type { UseRecoveryCode } from './recovery-codes.js';

const DECOY = 'hash-senuelo';
const CREDENTIALS = { email: 'ana@example.com', password: 'caballo grapa batería' };
const SEALED = 'secreto-cifrado';
const CODE = '123456';
const IP = '203.0.113.7';
const CLOCK = FixedClock.at('2026-09-22T15:00:00.000Z');

describe('LoginUser', () => {
  let users: FakeUserRepository;
  let verify: ReturnType<typeof vi.fn<(plain: string, hash: string) => Promise<boolean>>>;
  let verifyTotp: ReturnType<typeof vi.fn<(s: string, c: string) => TotpVerification | null>>;
  let useRecovery: ReturnType<typeof vi.fn<(u: string, c: string) => Promise<boolean>>>;
  let attempts: FakeLoginThrottleRepository;
  let recorded: AuditEntry[];
  let loginUser: LoginUser;

  /** Falla el login `times` veces seguidas con la contraseña equivocada. */
  async function failLogin(times: number): Promise<void> {
    verify.mockResolvedValue(false);

    for (let attempt = 0; attempt < times; attempt++) {
      await loginUser.execute({ ...CREDENTIALS, ip: IP }).catch(() => undefined);
    }

    verify.mockResolvedValue(true);
  }

  beforeEach(() => {
    users = new FakeUserRepository({ credentials: fakeCredentials() });
    verify = vi.fn(() => Promise.resolve(true));
    verifyTotp = vi.fn(() => ({ counter: 100 }));

    const passwords: PasswordHasher = { hash: () => Promise.resolve('x'), verify };
    const decoy = { get: () => DECOY } as DecoyPasswordHash;
    const totp: Totp = { enrol: () => ({ secret: 's', uri: 'u' }), verify: verifyTotp };
    const secrets = { open: () => 'secreto-en-claro', seal: () => SEALED } as unknown as SecretBox;

    useRecovery = vi.fn(() => Promise.resolve(true));
    const recoveryCodes = { execute: useRecovery } as unknown as UseRecoveryCode;

    attempts = new FakeLoginThrottleRepository();
    recorded = [];
    const audit: AuditLogger = {
      record: (entry) => {
        recorded.push(entry);

        return Promise.resolve();
      },
    };
    const throttle = new LoginThrottle(attempts, audit, CLOCK);

    loginUser = new LoginUser(
      users,
      passwords,
      decoy,
      totp,
      secrets,
      recoveryCodes,
      throttle,
      audit,
    );
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

    describe('and the phone is not at hand', () => {
      it('accepts a recovery code instead', async () => {
        await expect(
          loginUser.execute({ ...CREDENTIALS, recoveryCode: 'ABCD-EFGH-JKMN' }),
        ).resolves.toBe('user-1');
        expect(useRecovery).toHaveBeenCalledWith('user-1', 'ABCD-EFGH-JKMN');
      });

      it('rejects one that was already spent or never existed', async () => {
        useRecovery.mockResolvedValue(false);

        await expect(
          loginUser.execute({ ...CREDENTIALS, recoveryCode: 'ABCD-EFGH-JKMN' }),
        ).rejects.toThrow(InvalidTotpCodeError);
      });

      // Se acepta en lugar del código del teléfono, nunca además.
      it('does not ask the authenticator app when a recovery code is used', async () => {
        await loginUser.execute({ ...CREDENTIALS, recoveryCode: 'ABCD-EFGH-JKMN' });

        expect(verifyTotp).not.toHaveBeenCalled();
      });

      it('ignores an empty recovery code and still asks for the usual one', async () => {
        await expect(loginUser.execute({ ...CREDENTIALS, recoveryCode: '' })).rejects.toThrow(
          TotpRequiredError,
        );
      });
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

  describe('blocking brute force', () => {
    it('lets the fifth failure through and blocks the sixth attempt', async () => {
      await failLogin(5);

      await expect(loginUser.execute({ ...CREDENTIALS, ip: IP })).rejects.toThrow(
        TooManyLoginAttemptsError,
      );
    });

    it('says how long is left, so the client does not have to guess', async () => {
      await failLogin(5);

      const error = await loginUser.execute({ ...CREDENTIALS, ip: IP }).catch((e: unknown) => e);

      expect((error as TooManyLoginAttemptsError).retryAfterSeconds).toBe(60);
    });

    // Se comprueba antes de mirar la contraseña: si no, quien está bloqueado seguiría probando.
    it('does not even check the password while it is blocked', async () => {
      await failLogin(5);
      verify.mockClear();

      await expect(loginUser.execute({ ...CREDENTIALS, ip: IP })).rejects.toThrow();

      expect(verify).not.toHaveBeenCalled();
    });

    it('counts the email and the ip separately', async () => {
      await failLogin(5);

      expect([...attempts.records.keys()].map((key) => key.split(':')[0])).toEqual(['email', 'ip']);
    });

    // Anti-enumeración: un correo sin cuenta se cuenta igual, así que el bloqueo no delata
    // qué correos están registrados.
    it('blocks an email that has no account just the same', async () => {
      users.credentials = null;
      await failLogin(5);

      await expect(loginUser.execute({ ...CREDENTIALS, ip: IP })).rejects.toThrow(
        TooManyLoginAttemptsError,
      );
    });

    it('forgets the failures after signing in correctly', async () => {
      await failLogin(4);

      await loginUser.execute({ ...CREDENTIALS, ip: IP });

      expect(attempts.records.size).toBe(0);
    });

    it('does not count arriving without a second factor code', async () => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
      });

      await expect(loginUser.execute({ ...CREDENTIALS, ip: IP })).rejects.toThrow(
        TotpRequiredError,
      );

      expect(attempts.records.size).toBe(0);
    });

    // Un código TOTP son seis dígitos: sin freno, quien ya tiene la contraseña los prueba todos.
    it('counts a wrong second factor code', async () => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      verifyTotp.mockReturnValue(null);

      await expect(loginUser.execute({ ...CREDENTIALS, ip: IP, totpCode: CODE })).rejects.toThrow(
        InvalidTotpCodeError,
      );

      expect(attempts.records.size).toBe(2);
    });

    it('counts a wrong recovery code', async () => {
      users.credentials = fakeCredentials({
        totpSecret: SEALED,
        totpConfirmedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      useRecovery.mockResolvedValue(false);

      await expect(
        loginUser.execute({ ...CREDENTIALS, ip: IP, recoveryCode: 'ABCD-EFGH-JKMN' }),
      ).rejects.toThrow(InvalidTotpCodeError);

      expect(attempts.records.size).toBe(2);
    });
  });

  describe('the audit log', () => {
    it('records a successful sign-in with its origin', async () => {
      await loginUser.execute({ ...CREDENTIALS, ip: IP, userAgent: 'Firefox' });

      expect(recorded).toEqual([
        {
          userId: 'user-1',
          action: 'login.succeeded',
          entity: 'user',
          entityId: 'user-1',
          ip: IP,
          userAgent: 'Firefox',
        },
      ]);
    });

    it('records a failed attempt', async () => {
      await failLogin(1);

      expect(recorded).toEqual([expect.objectContaining({ action: 'login.failed', ip: IP })]);
    });

    it('records the attempt that locks the account as such', async () => {
      await failLogin(5);

      expect(recorded.map((entry) => entry.action)).toEqual([
        'login.failed',
        'login.failed',
        'login.failed',
        'login.failed',
        'login.locked',
      ]);
    });

    // Sin cuenta detrás no hay a quién atribuirlo, pero la IP sí queda.
    it('records an attempt against an unknown email without any user', async () => {
      users.credentials = null;

      await failLogin(1);

      expect(recorded).toEqual([
        expect.objectContaining({ action: 'login.failed', userId: undefined }),
      ]);
    });

    it('never writes the password or the email down', async () => {
      await failLogin(1);

      expect(JSON.stringify(recorded)).not.toContain(CREDENTIALS.password);
      expect(JSON.stringify(recorded)).not.toContain(CREDENTIALS.email);
    });
  });
});
