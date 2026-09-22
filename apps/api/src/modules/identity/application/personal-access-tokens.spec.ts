import {
  type Clock,
  FixedClock,
  InvalidTokenLifetimeError,
  UnknownTokenScopeError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  InsufficientTokenScopeError,
  InvalidPersonalAccessTokenError,
  PersonalAccessTokenNotFoundError,
} from '../domain/errors.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import type { AuditEntry, AuditLogger } from '../ports/audit-logger.js';
import { FakePersonalAccessTokenRepository } from '../ports/personal-access-token-repository.fake.js';
import {
  AuthenticatePersonalAccessToken,
  CreatePersonalAccessToken,
  ListPersonalAccessTokens,
  RevokePersonalAccessToken,
} from './personal-access-tokens.js';

const NOW = '2026-09-22T15:00:00.000Z';
const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const ORIGIN = { ip: '203.0.113.7', userAgent: 'Atajos de iOS' };
const IPHONE = { name: 'iPhone', scopes: ['captures:write'] };

class RecordingAuditLogger implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);

    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}

describe('personal access tokens', () => {
  let tokens: FakePersonalAccessTokenRepository;
  let audit: RecordingAuditLogger;
  let clock: Clock;
  let create: CreatePersonalAccessToken;
  let list: ListPersonalAccessTokens;
  let revoke: RevokePersonalAccessToken;
  let authenticate: AuthenticatePersonalAccessToken;

  function useClock(instant: string): void {
    clock = FixedClock.at(instant);
    create = new CreatePersonalAccessToken(tokens, audit, clock);
    revoke = new RevokePersonalAccessToken(tokens, audit, clock);
    authenticate = new AuthenticatePersonalAccessToken(tokens, audit, clock);
  }

  beforeEach(() => {
    tokens = new FakePersonalAccessTokenRepository(new Date(NOW));
    audit = new RecordingAuditLogger();
    list = new ListPersonalAccessTokens(tokens);
    useClock(NOW);
  });

  describe('creating one', () => {
    it('hands out the value once, with the prefix that identifies it', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });

      expect(created.token).toMatch(/^sas_pat_[0-9a-f]{32}[\w-]{43}$/);
      expect(created).toMatchObject({ name: 'iPhone', scopes: ['captures:write'] });
    });

    it('stores only the hash of the secret, never the token', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });
      const [row] = tokens.rows;

      expect(row?.tokenHash).toBe(hashSessionToken(created.token.slice(-43)));
      expect(JSON.stringify(tokens.rows)).not.toContain(created.token.slice(-43));
    });

    it('expires after ninety days unless told otherwise', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });

      expect(created.expiresAt).toEqual(new Date('2026-12-21T15:00:00.000Z'));
    });

    it('expires when its owner chose', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE, expiresInDays: 7 });

      expect(created.expiresAt).toEqual(new Date('2026-09-29T15:00:00.000Z'));
    });

    it('refuses a lifetime the domain does not allow, and stores nothing', async () => {
      await expect(create.execute({ userId: ANA, ...IPHONE, expiresInDays: 400 })).rejects.toThrow(
        InvalidTokenLifetimeError,
      );
      expect(tokens.rows).toHaveLength(0);
    });

    it('refuses an unknown scope, and stores nothing', async () => {
      await expect(
        create.execute({ userId: ANA, name: 'iPhone', scopes: ['transactions:read'] }),
      ).rejects.toThrow(UnknownTokenScopeError);
      expect(tokens.rows).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
    });

    it('leaves a trace in the audit log, without the token', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE, ...ORIGIN });

      expect(audit.entries).toEqual([
        {
          userId: ANA,
          action: 'personal_access_token.created',
          entity: 'personal_access_token',
          entityId: created.id,
          ...ORIGIN,
        },
      ]);
    });
  });

  describe('listing them', () => {
    it('shows only the tokens of whoever asks', async () => {
      await create.execute({ userId: ANA, ...IPHONE });
      await create.execute({ userId: BRUNO, name: 'Android', scopes: ['captures:write'] });

      const listed = await list.execute(ANA);

      expect(listed.map((token) => token.name)).toEqual(['iPhone']);
    });

    it('never includes the value', async () => {
      await create.execute({ userId: ANA, ...IPHONE });

      const [listed] = await list.execute(ANA);

      expect(listed).not.toHaveProperty('token');
      expect(listed).not.toHaveProperty('tokenHash');
    });
  });

  describe('revoking one', () => {
    it('takes it off the list and records it', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });

      await revoke.execute({ userId: ANA, tokenId: created.id, ...ORIGIN });

      await expect(list.execute(ANA)).resolves.toEqual([]);
      expect(audit.entries.at(-1)).toEqual({
        userId: ANA,
        action: 'personal_access_token.revoked',
        entity: 'personal_access_token',
        entityId: created.id,
        ...ORIGIN,
      });
    });

    // Anti-IDOR: el token de otra cuenta responde igual que uno que no existe.
    it('cannot revoke a token of another account', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });

      await expect(revoke.execute({ userId: BRUNO, tokenId: created.id })).rejects.toThrow(
        PersonalAccessTokenNotFoundError,
      );
      await expect(list.execute(ANA)).resolves.toHaveLength(1);
    });

    it('does not revoke the same token twice', async () => {
      const created = await create.execute({ userId: ANA, ...IPHONE });
      await revoke.execute({ userId: ANA, tokenId: created.id });

      await expect(revoke.execute({ userId: ANA, tokenId: created.id })).rejects.toThrow(
        PersonalAccessTokenNotFoundError,
      );
      expect(audit.actions().filter((action) => action.endsWith('.revoked'))).toHaveLength(1);
    });
  });

  describe('authenticating with one', () => {
    async function issued(): Promise<string> {
      return (await create.execute({ userId: ANA, ...IPHONE })).token;
    }

    it('says whose token it is', async () => {
      const token = await issued();

      await expect(authenticate.execute({ token, requiredScope: 'captures:write' })).resolves.toBe(
        ANA,
      );
    });

    it('remembers when it was last used, and records the use', async () => {
      const token = await issued();
      useClock('2026-10-01T09:30:00.000Z');

      await authenticate.execute({ token, requiredScope: 'captures:write', ...ORIGIN });

      expect(tokens.rows[0]?.lastUsedAt).toEqual(new Date('2026-10-01T09:30:00.000Z'));
      expect(audit.entries.at(-1)).toMatchObject({
        userId: ANA,
        action: 'personal_access_token.used',
        ...ORIGIN,
      });
    });

    it('works until the last instant before it expires', async () => {
      const token = await issued();
      useClock('2026-12-21T14:59:59.999Z');

      await expect(authenticate.execute({ token, requiredScope: 'captures:write' })).resolves.toBe(
        ANA,
      );
    });

    describe('turning it away', () => {
      it('rejects text that is not a personal token, without looking it up', async () => {
        await expect(
          authenticate.execute({ token: 'sas_pat_corto', requiredScope: 'captures:write' }),
        ).rejects.toThrow(InvalidPersonalAccessTokenError);
        expect(audit.entries).toHaveLength(0);
      });

      it('rejects a token whose id does not exist, and records nothing', async () => {
        const token = await issued();
        const unknown = token.replace(/^sas_pat_[0-9a-f]{32}/, `sas_pat_${'f'.repeat(32)}`);

        await expect(
          authenticate.execute({ token: unknown, requiredScope: 'captures:write' }),
        ).rejects.toThrow(InvalidPersonalAccessTokenError);
        expect(audit.actions()).toEqual(['personal_access_token.created']);
      });

      it('rejects a wrong secret and records the attempt', async () => {
        const token = await issued();
        const forged = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

        await expect(
          authenticate.execute({ token: forged, requiredScope: 'captures:write' }),
        ).rejects.toThrow(InvalidPersonalAccessTokenError);
        expect(audit.actions().at(-1)).toBe('personal_access_token.rejected_secret');
      });

      it('rejects a revoked token and records the attempt', async () => {
        const created = await create.execute({ userId: ANA, ...IPHONE });
        await revoke.execute({ userId: ANA, tokenId: created.id });

        await expect(
          authenticate.execute({ token: created.token, requiredScope: 'captures:write' }),
        ).rejects.toThrow(InvalidPersonalAccessTokenError);
        expect(audit.actions().at(-1)).toBe('personal_access_token.rejected_revoked');
      });

      // El borde cuenta como caducado, como con el resto de los tokens.
      it('rejects it from the instant it expires, and records the attempt', async () => {
        const token = await issued();
        useClock('2026-12-21T15:00:00.000Z');

        await expect(
          authenticate.execute({ token, requiredScope: 'captures:write' }),
        ).rejects.toThrow(InvalidPersonalAccessTokenError);
        expect(audit.actions().at(-1)).toBe('personal_access_token.rejected_expired');
      });

      it('does not mark a rejected token as used', async () => {
        const token = await issued();
        useClock('2027-01-01T00:00:00.000Z');

        await expect(
          authenticate.execute({ token, requiredScope: 'captures:write' }),
        ).rejects.toThrow();
        expect(tokens.rows[0]?.lastUsedAt).toBeNull();
      });

      // El token del celular no puede tocar la cuenta: la ruta no acepta tokens personales.
      it('refuses a route that is only for sessions, with a 403 and a trace', async () => {
        const token = await issued();

        await expect(authenticate.execute({ token, requiredScope: null })).rejects.toThrow(
          InsufficientTokenScopeError,
        );
        expect(audit.actions().at(-1)).toBe('personal_access_token.rejected_scope');
        expect(tokens.rows[0]?.lastUsedAt).toBeNull();
      });

      it('refuses a token whose scopes do not include the one the route needs', async () => {
        const created = await create.execute({ userId: ANA, ...IPHONE });
        const [row] = tokens.rows;
        if (row !== undefined) row.scopes = [];

        await expect(
          authenticate.execute({ token: created.token, requiredScope: 'captures:write' }),
        ).rejects.toThrow(InsufficientTokenScopeError);
      });
    });
  });
});
