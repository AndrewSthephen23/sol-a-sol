import { FixedClock } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidRefreshTokenError } from '../domain/errors.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import type { AuditEntry, AuditLogger } from '../ports/audit-logger.js';
import type {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../ports/refresh-token-repository.js';
import type { IssueSession, Session } from './issue-session.js';
import { RefreshSession } from './refresh-session.js';

const NOW = '2026-09-20T15:00:00.000Z';
const CLOCK = FixedClock.at(NOW);
const TOKEN = 'un-refresco';
const USER_ID = 'user-1';

const VALID: StoredRefreshToken = {
  id: 'token-1',
  userId: USER_ID,
  expiresAt: new Date('2026-10-20T15:00:00.000Z'),
  usedAt: null,
  revokedAt: null,
};

const NEW_SESSION: Session = {
  access: { token: 'nuevo-acceso', expiresInSeconds: 900 },
  refreshToken: 'nuevo-refresco',
  refreshExpiresAt: new Date('2026-10-20T15:00:00.000Z'),
};

describe('RefreshSession', () => {
  let stored: StoredRefreshToken | null;
  let markUsed: ReturnType<typeof vi.fn<(id: string, at: Date) => Promise<boolean>>>;
  let revokeAllForUser: ReturnType<typeof vi.fn<(userId: string, at: Date) => Promise<number>>>;
  let recorded: AuditEntry[];
  let issue: ReturnType<typeof vi.fn<(userId: string) => Promise<Session>>>;
  let refreshSession: RefreshSession;

  beforeEach(() => {
    stored = { ...VALID };
    markUsed = vi.fn(() => Promise.resolve(true));
    revokeAllForUser = vi.fn(() => Promise.resolve(2));
    recorded = [];
    issue = vi.fn(() => Promise.resolve(NEW_SESSION));

    const refreshTokens: RefreshTokenRepository = {
      create: () => Promise.resolve(),
      findByHash: () => Promise.resolve(stored),
      markUsed,
      revoke: () => Promise.resolve(),
      revokeAllForUser,
    };
    const audit: AuditLogger = {
      record: (entry) => {
        recorded.push(entry);

        return Promise.resolve();
      },
    };

    refreshSession = new RefreshSession(refreshTokens, audit, CLOCK, {
      execute: issue,
    } as unknown as IssueSession);
  });

  describe('rotation', () => {
    it('hands out a brand new session', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).resolves.toEqual(NEW_SESSION);
      expect(issue).toHaveBeenCalledWith(USER_ID);
    });

    // Sin esto el refresco sería eterno y reutilizable: la rotación es lo que hace que robarlo
    // solo sirva una vez.
    it('marks the old one as spent, at the instant the clock says', async () => {
      await refreshSession.execute({ token: TOKEN });

      expect(markUsed).toHaveBeenCalledWith(VALID.id, new Date(NOW));
    });

    it('looks the token up by its hash, never by its value', async () => {
      const findByHash = vi.fn(() => Promise.resolve(stored));
      const repository = {
        create: () => Promise.resolve(),
        findByHash,
        markUsed,
        revoke: () => Promise.resolve(),
        revokeAllForUser,
      } satisfies RefreshTokenRepository;
      const session = new RefreshSession(repository, { record: () => Promise.resolve() }, CLOCK, {
        execute: issue,
      } as unknown as IssueSession);

      await session.execute({ token: TOKEN });

      expect(findByHash).toHaveBeenCalledWith(hashSessionToken(TOKEN));
    });
  });

  describe('turning a session down', () => {
    it('rejects a request with no cookie', async () => {
      await expect(refreshSession.execute({ token: undefined })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('rejects an empty cookie', async () => {
      await expect(refreshSession.execute({ token: '' })).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('rejects a token that is not in the database', async () => {
      stored = null;

      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('rejects a revoked token', async () => {
      stored = { ...VALID, revokedAt: new Date('2026-09-19T00:00:00.000Z') };

      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('rejects an expired token', async () => {
      stored = { ...VALID, expiresAt: new Date('2026-09-20T14:59:59.999Z') };

      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('accepts one that expires a millisecond from now', async () => {
      stored = { ...VALID, expiresAt: new Date('2026-09-20T15:00:00.001Z') };

      await expect(refreshSession.execute({ token: TOKEN })).resolves.toEqual(NEW_SESSION);
    });

    it('gives the same error whatever went wrong', async () => {
      const reasons = [
        { ...VALID, revokedAt: new Date('2026-09-19T00:00:00.000Z') },
        { ...VALID, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
      ];

      for (const reason of reasons) {
        stored = reason;
        const error = await refreshSession.execute({ token: TOKEN }).catch((e: unknown) => e);
        expect((error as Error).message).toBe(new InvalidRefreshTokenError().message);
      }
    });
  });

  describe('when a token comes back a second time', () => {
    beforeEach(() => {
      stored = { ...VALID, usedAt: new Date('2026-09-20T14:00:00.000Z') };
    });

    it('refuses it', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    // No hay forma de saber si quien lo presenta es la víctima o quien lo copió, así que se
    // echa a los dos y la persona vuelve a entrar con su contraseña.
    it('closes every session of that account, not just this one', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow();

      expect(revokeAllForUser).toHaveBeenCalledWith(USER_ID, new Date(NOW));
    });

    it('leaves it written down in the audit log', async () => {
      await expect(
        refreshSession.execute({ token: TOKEN, ip: '203.0.113.7', userAgent: 'curl' }),
      ).rejects.toThrow();

      expect(recorded).toEqual([
        {
          userId: USER_ID,
          action: 'refresh_token.reused',
          entity: 'refresh_token',
          entityId: VALID.id,
          ip: '203.0.113.7',
          userAgent: 'curl',
        },
      ]);
    });

    it('never writes the token itself down', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow();

      expect(JSON.stringify(recorded)).not.toContain(TOKEN);
    });

    it('hands out no new session', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow();

      expect(issue).not.toHaveBeenCalled();
    });
  });

  // Dos pestañas pueden refrescar a la vez con la misma cookie. Solo una gana la carrera; desde
  // fuera la otra es indistinguible de un token robado, así que se trata igual.
  describe('when two requests race with the same token', () => {
    beforeEach(() => {
      markUsed.mockResolvedValue(false);
    });

    it('turns the loser down', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('treats it as reuse and closes every session', async () => {
      await expect(refreshSession.execute({ token: TOKEN })).rejects.toThrow();

      expect(revokeAllForUser).toHaveBeenCalledWith(USER_ID, new Date(NOW));
      expect(recorded).toHaveLength(1);
    });
  });
});
