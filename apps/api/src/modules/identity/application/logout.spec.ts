import { FixedClock } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashSessionToken } from '../infrastructure/session-token.js';
import type {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../ports/refresh-token-repository.js';
import { Logout } from './logout.js';

const NOW = '2026-09-20T15:00:00.000Z';
const TOKEN = 'un-refresco';

const STORED: StoredRefreshToken = {
  id: 'token-1',
  userId: 'user-1',
  expiresAt: new Date('2026-10-20T15:00:00.000Z'),
  usedAt: null,
  revokedAt: null,
};

describe('Logout', () => {
  let found: StoredRefreshToken | null;
  let revoke: ReturnType<typeof vi.fn<(id: string, at: Date) => Promise<void>>>;
  let findByHash: ReturnType<typeof vi.fn<(hash: string) => Promise<StoredRefreshToken | null>>>;
  let logout: Logout;

  beforeEach(() => {
    found = STORED;
    revoke = vi.fn(() => Promise.resolve());
    findByHash = vi.fn(() => Promise.resolve(found));

    const refreshTokens: RefreshTokenRepository = {
      create: () => Promise.resolve(),
      findByHash,
      markUsed: () => Promise.resolve(true),
      revoke,
      revokeAllForUser: () => Promise.resolve(0),
    };

    logout = new Logout(refreshTokens, FixedClock.at(NOW));
  });

  it('revokes the session the cookie points at', async () => {
    await logout.execute(TOKEN);

    expect(findByHash).toHaveBeenCalledWith(hashSessionToken(TOKEN));
    expect(revoke).toHaveBeenCalledWith(STORED.id, new Date(NOW));
  });

  // Quien cierra sesión quiere irse; devolverle un error no le sirve de nada, pero sí le diría
  // a un tercero si un token que probó existe.
  describe('never failing', () => {
    it('does nothing and does not complain without a cookie', async () => {
      await expect(logout.execute(undefined)).resolves.toBeUndefined();
      expect(revoke).not.toHaveBeenCalled();
    });

    it('does nothing and does not complain with an empty cookie', async () => {
      await expect(logout.execute('')).resolves.toBeUndefined();
      expect(findByHash).not.toHaveBeenCalled();
    });

    it('does nothing and does not complain with a token nobody knows', async () => {
      found = null;

      await expect(logout.execute(TOKEN)).resolves.toBeUndefined();
      expect(revoke).not.toHaveBeenCalled();
    });
  });

  // Solo la suya: cerrar sesión en el portátil no debe echarte del celular.
  it('leaves the other sessions of the account alone', async () => {
    await logout.execute(TOKEN);

    expect(revoke).toHaveBeenCalledExactlyOnceWith(STORED.id, new Date(NOW));
  });
});
