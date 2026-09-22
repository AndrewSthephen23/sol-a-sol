import { describe, expect, it } from 'vitest';

import {
  createPersonalAccessTokenSecret,
  formatPersonalAccessToken,
  looksLikePersonalAccessToken,
  parsePersonalAccessToken,
  PERSONAL_ACCESS_TOKEN_PREFIX,
  secretMatches,
} from './personal-access-token-value.js';
import { hashSessionToken } from './session-token.js';

const ID = '01999999-9999-7999-8999-999999999999';

describe('personal access token value', () => {
  it('generates a different secret every time', () => {
    const secrets = new Set(
      Array.from({ length: 50 }, () => createPersonalAccessTokenSecret().secret),
    );

    expect(secrets.size).toBe(50);
  });

  it('stores only the SHA-256 of the secret', () => {
    const { secret, hash } = createPersonalAccessTokenSecret();

    expect(hash).toBe(hashSessionToken(secret));
    expect(hash).not.toContain(secret);
  });

  it('starts with a prefix that tells it apart from a JWT', () => {
    const { secret } = createPersonalAccessTokenSecret();
    const token = formatPersonalAccessToken(ID, secret);

    expect(token.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)).toBe(true);
    expect(looksLikePersonalAccessToken(token)).toBe(true);
    expect(looksLikePersonalAccessToken('eyJhbGciOiJIUzI1NiJ9.e30.firma')).toBe(false);
  });

  it('reads back the id and the secret it was built from', () => {
    const { secret } = createPersonalAccessTokenSecret();

    expect(parsePersonalAccessToken(formatPersonalAccessToken(ID, secret))).toEqual({
      id: ID,
      secret,
    });
  });

  it.each([
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.e30.firma'],
    ['only the prefix', PERSONAL_ACCESS_TOKEN_PREFIX],
    ['a truncated token', `${PERSONAL_ACCESS_TOKEN_PREFIX}${'a'.repeat(74)}`],
    ['a token that is too long', `${PERSONAL_ACCESS_TOKEN_PREFIX}${'a'.repeat(76)}`],
    [
      'an id that is not hexadecimal',
      `${PERSONAL_ACCESS_TOKEN_PREFIX}${'z'.repeat(32)}${'a'.repeat(43)}`,
    ],
    [
      'a secret with foreign symbols',
      `${PERSONAL_ACCESS_TOKEN_PREFIX}${'a'.repeat(32)}${'*'.repeat(43)}`,
    ],
  ])('rejects %s without touching the database', (_case, value) => {
    expect(parsePersonalAccessToken(value)).toBeNull();
  });

  it('matches the secret it was hashed from', () => {
    const { secret, hash } = createPersonalAccessTokenSecret();

    expect(secretMatches(secret, hash)).toBe(true);
  });

  it('does not match another secret', () => {
    const { hash } = createPersonalAccessTokenSecret();

    expect(secretMatches(createPersonalAccessTokenSecret().secret, hash)).toBe(false);
  });

  it('does not match a stored hash of another length instead of throwing', () => {
    expect(secretMatches(createPersonalAccessTokenSecret().secret, 'abcd')).toBe(false);
  });
});
