import { describe, expect, it } from 'vitest';

import {
  createPersonalAccessTokenRequestSchema,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_SCOPES_MAX_ITEMS,
} from './personal-access-tokens.js';

const VALID = { name: 'iPhone', scopes: ['captures:write'], expiresInDays: 30 };

describe('create personal access token request', () => {
  it('accepts a name, its scopes and a lifetime', () => {
    expect(createPersonalAccessTokenRequestSchema.parse(VALID)).toEqual(VALID);
  });

  it('leaves the lifetime out when it is not sent, so the domain applies its default', () => {
    const parsed = createPersonalAccessTokenRequestSchema.parse({
      ...VALID,
      expiresInDays: undefined,
    });

    expect(parsed.expiresInDays).toBeUndefined();
  });

  it('trims the name', () => {
    expect(createPersonalAccessTokenRequestSchema.parse({ ...VALID, name: '  iPhone ' }).name).toBe(
      'iPhone',
    );
  });

  it.each(['', '   '])('rejects a blank name (%j)', (name) => {
    expect(createPersonalAccessTokenRequestSchema.safeParse({ ...VALID, name }).success).toBe(
      false,
    );
  });

  it('rejects a name past the defensive limit', () => {
    const name = 'a'.repeat(TOKEN_NAME_MAX_LENGTH + 1);

    expect(createPersonalAccessTokenRequestSchema.safeParse({ ...VALID, name }).success).toBe(
      false,
    );
  });

  it('rejects more scopes than anyone needs', () => {
    const scopes = Array.from({ length: TOKEN_SCOPES_MAX_ITEMS + 1 }, () => 'captures:write');

    expect(createPersonalAccessTokenRequestSchema.safeParse({ ...VALID, scopes }).success).toBe(
      false,
    );
  });

  it('rejects a lifetime that is not a whole number', () => {
    expect(
      createPersonalAccessTokenRequestSchema.safeParse({ ...VALID, expiresInDays: 1.5 }).success,
    ).toBe(false);
  });

  // Sin scopes no se puede crear, pero esa es una regla del dominio: aquí solo se mira la forma.
  it('leaves the meaning of the scopes to the domain', () => {
    expect(
      createPersonalAccessTokenRequestSchema.safeParse({ ...VALID, scopes: ['no:existe'] }).success,
    ).toBe(true);
  });
});
