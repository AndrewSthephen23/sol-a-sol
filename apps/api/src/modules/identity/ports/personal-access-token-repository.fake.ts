import type {
  NewPersonalAccessToken,
  PersonalAccessTokenRepository,
  PersonalAccessTokenSummary,
  StoredPersonalAccessToken,
} from './personal-access-token-repository.js';

interface Row extends StoredPersonalAccessToken {
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Repositorio en memoria para probar los casos de uso sin base de datos. */
export class FakePersonalAccessTokenRepository implements PersonalAccessTokenRepository {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(private readonly createdAt = new Date('2026-09-22T15:00:00.000Z')) {}

  create(token: NewPersonalAccessToken): Promise<PersonalAccessTokenSummary> {
    this.sequence += 1;
    const row: Row = {
      ...token,
      // Con forma de UUID, como los de verdad: el token lleva el id dentro.
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      createdAt: this.createdAt,
      lastUsedAt: null,
      revokedAt: null,
    };
    this.rows.push(row);

    return Promise.resolve(summaryOf(row));
  }

  listActive(userId: string): Promise<PersonalAccessTokenSummary[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId && row.revokedAt === null)
        .reverse()
        .map(summaryOf),
    );
  }

  revoke(userId: string, id: string, revokedAt: Date): Promise<boolean> {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id && candidate.userId === userId && candidate.revokedAt === null,
    );
    if (row !== undefined) row.revokedAt = revokedAt;

    return Promise.resolve(row !== undefined);
  }

  findForAuthentication(id: string): Promise<StoredPersonalAccessToken | null> {
    const row = this.rows.find((candidate) => candidate.id === id);

    return Promise.resolve(
      row === undefined
        ? null
        : {
            id: row.id,
            userId: row.userId,
            tokenHash: row.tokenHash,
            scopes: row.scopes,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
          },
    );
  }

  recordUse(id: string, usedAt: Date): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row !== undefined) row.lastUsedAt = usedAt;

    return Promise.resolve();
  }
}

function summaryOf(row: Row): PersonalAccessTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
  };
}
