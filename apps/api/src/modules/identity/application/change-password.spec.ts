import { FixedClock, PasswordTooCommonError, PasswordTooShortError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CurrentPasswordIncorrectError } from '../domain/errors.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import type { AuditEntry } from '../ports/audit-logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import { FakePersonalAccessTokenRepository } from '../ports/personal-access-token-repository.fake.js';
import type { RefreshTokenRepository } from '../ports/refresh-token-repository.js';
import { fakeCredentials, FakeUserRepository } from '../ports/user-repository.fake.js';
import { ChangePassword } from './change-password.js';
import { ApplySecurityChange } from './security-change.js';

const NOW = '2026-09-22T15:00:00.000Z';
const USER_ID = 'user-1';
const CURRENT_COOKIE = 'refresco-de-esta-sesion';
const CHANGE = {
  userId: USER_ID,
  currentPassword: 'la contraseña de antes',
  newPassword: 'una frase nueva y bastante larga',
  currentRefreshToken: CURRENT_COOKIE,
  ip: '203.0.113.7',
  userAgent: 'Firefox',
};

describe('ChangePassword', () => {
  let users: FakeUserRepository;
  let tokens: FakePersonalAccessTokenRepository;
  let verify: ReturnType<typeof vi.fn<(plain: string, hash: string) => Promise<boolean>>>;
  let revokeAllForUser: ReturnType<
    typeof vi.fn<(userId: string, at: Date, except?: string) => Promise<number>>
  >;
  let recorded: AuditEntry[];
  let changePassword: ChangePassword;

  beforeEach(() => {
    users = new FakeUserRepository({ credentials: fakeCredentials() });
    tokens = new FakePersonalAccessTokenRepository();
    verify = vi.fn(() => Promise.resolve(true));
    revokeAllForUser = vi.fn(() => Promise.resolve(2));
    recorded = [];

    const passwords: PasswordHasher = {
      hash: (plain) => Promise.resolve(`hash(${plain})`),
      verify,
    };
    const refreshTokens = { revokeAllForUser } as unknown as RefreshTokenRepository;
    const clock = FixedClock.at(NOW);
    const audit = {
      record: (entry: AuditEntry) => {
        recorded.push(entry);

        return Promise.resolve();
      },
    };

    changePassword = new ChangePassword(
      users,
      passwords,
      audit,
      new ApplySecurityChange(refreshTokens, tokens, clock),
    );
  });

  it('stores the hash of the new password', async () => {
    await changePassword.execute(CHANGE);

    expect(users.passwordChanges).toEqual([
      { userId: USER_ID, passwordHash: `hash(${CHANGE.newPassword})` },
    ]);
  });

  it('checks the current password against the stored hash', async () => {
    await changePassword.execute(CHANGE);

    expect(verify).toHaveBeenCalledWith(CHANGE.currentPassword, 'hash-real');
  });

  // Quien pille una sesión abierta un momento no debe poder quedarse con la cuenta.
  it('refuses when the current password is wrong, and changes nothing', async () => {
    verify.mockResolvedValue(false);

    await expect(changePassword.execute(CHANGE)).rejects.toThrow(CurrentPasswordIncorrectError);
    expect(users.passwordChanges).toEqual([]);
    expect(revokeAllForUser).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it('refuses when the account no longer exists', async () => {
    users.credentials = null;

    await expect(changePassword.execute(CHANGE)).rejects.toThrow(CurrentPasswordIncorrectError);
  });

  it.each([
    ['too short', 'corta', PasswordTooShortError],
    ['too common', 'password1234', PasswordTooCommonError],
  ])('applies the same policy as the registration (%s)', async (_case, newPassword, error) => {
    await expect(changePassword.execute({ ...CHANGE, newPassword })).rejects.toThrow(error);
    expect(users.passwordChanges).toEqual([]);
  });

  it('closes the other sessions but keeps this one', async () => {
    const notice = await changePassword.execute(CHANGE);

    expect(revokeAllForUser).toHaveBeenCalledWith(
      USER_ID,
      new Date(NOW),
      hashSessionToken(CURRENT_COOKIE),
    );
    expect(notice.otherSessionsClosed).toBe(2);
  });

  it('closes every session when the request brings no cookie', async () => {
    await changePassword.execute({ ...CHANGE, currentRefreshToken: undefined });

    expect(revokeAllForUser).toHaveBeenCalledWith(USER_ID, new Date(NOW), undefined);
  });

  // Decisión 7: revocarlos rompería en silencio la captura desde el celular.
  it('leaves the personal tokens alone and lists them, so the owner can decide', async () => {
    const phone = await tokens.create({
      userId: USER_ID,
      name: 'iPhone',
      tokenHash: 'h',
      scopes: ['captures:write'],
      expiresAt: new Date('2026-12-21T15:00:00.000Z'),
    });

    const notice = await changePassword.execute(CHANGE);

    expect(notice.personalAccessTokens).toEqual([phone]);
    expect(tokens.rows[0]?.revokedAt).toBeNull();
  });

  it('records the change with its origin, and no password', async () => {
    await changePassword.execute(CHANGE);

    expect(recorded).toEqual([
      {
        userId: USER_ID,
        action: 'password.changed',
        entity: 'user',
        entityId: USER_ID,
        ip: CHANGE.ip,
        userAgent: CHANGE.userAgent,
      },
    ]);
  });
});
