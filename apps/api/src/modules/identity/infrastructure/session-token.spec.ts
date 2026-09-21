import { describe, expect, it } from 'vitest';

import { createSessionToken, hashSessionToken } from './session-token.js';

describe('createSessionToken', () => {
  it('carries a value and the hash that will be stored', () => {
    const { value, hash } = createSessionToken();

    expect(hash).toBe(hashSessionToken(value));
  });

  it('never repeats a value', () => {
    const values = new Set(Array.from({ length: 100 }, () => createSessionToken().value));

    expect(values.size).toBe(100);
  });

  it('carries 256 bits of randomness, encoded so a cookie needs no escaping', () => {
    const { value } = createSessionToken();

    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(value, 'base64url')).toHaveLength(32);
  });

  // Lo que se guarda no puede servir para suplantar a nadie si se filtra la base.
  it('does not let the hash give the value away', () => {
    const { value, hash } = createSessionToken();

    expect(hash).not.toContain(value);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashSessionToken', () => {
  it('gives the same hash for the same value, so it can be looked up', () => {
    expect(hashSessionToken('abc')).toBe(hashSessionToken('abc'));
  });

  it('gives a different hash for a value that differs by one character', () => {
    expect(hashSessionToken('abc')).not.toBe(hashSessionToken('abd'));
  });
});
