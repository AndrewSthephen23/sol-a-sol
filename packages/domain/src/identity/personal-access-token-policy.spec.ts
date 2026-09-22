import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain-error.js';
import { FixedClock } from '../time/clock.js';
import {
  grantsScope,
  InvalidTokenLifetimeError,
  isPersonalAccessTokenScope,
  PERSONAL_ACCESS_TOKEN_DEFAULT_TTL_DAYS,
  PERSONAL_ACCESS_TOKEN_MAX_TTL_DAYS,
  PERSONAL_ACCESS_TOKEN_MIN_TTL_DAYS,
  PERSONAL_ACCESS_TOKEN_SCOPES,
  personalAccessTokenExpiresAt,
  toPersonalAccessTokenScopes,
  UnknownTokenScopeError,
} from './personal-access-token-policy.js';

const CLOCK = FixedClock.at('2026-09-22T15:00:00.000Z');

describe('personal access token scopes', () => {
  // El celular solo necesita mandar capturas: ni leer transacciones ni tocar la cuenta.
  it('starts with a single scope, to send captures', () => {
    expect(PERSONAL_ACCESS_TOKEN_SCOPES).toEqual(['captures:write']);
  });

  it('recognises a known scope', () => {
    expect(isPersonalAccessTokenScope('captures:write')).toBe(true);
  });

  it.each(['captures:read', 'CAPTURES:WRITE', ' captures:write', '', '*'])(
    'does not recognise %j',
    (scope) => {
      expect(isPersonalAccessTokenScope(scope)).toBe(false);
    },
  );

  it('accepts a list of known scopes', () => {
    expect(toPersonalAccessTokenScopes(['captures:write'])).toEqual(['captures:write']);
  });

  it('drops repeated scopes', () => {
    expect(toPersonalAccessTokenScopes(['captures:write', 'captures:write'])).toEqual([
      'captures:write',
    ]);
  });

  // Un scope desconocido suele ser un error de tipeo: aceptarlo en silencio daría un token que
  // no sirve para lo que su dueño cree.
  it('rejects an unknown scope instead of ignoring it', () => {
    expect(() => toPersonalAccessTokenScopes(['captures:write', 'accounts:admin'])).toThrow(
      UnknownTokenScopeError,
    );
  });

  // Un token sin permisos no serviría para nada y confundiría a quien lo creó.
  it('rejects an empty list', () => {
    expect(() => toPersonalAccessTokenScopes([])).toThrow(UnknownTokenScopeError);
  });

  it('reports the rule as a domain error with a stable code', () => {
    const error = new UnknownTokenScopeError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('UNKNOWN_TOKEN_SCOPE');
    expect(error.message).toBe(
      'A personal access token needs at least one scope, and every scope must exist.',
    );
  });
});

describe('grantsScope', () => {
  it('grants a scope the token has', () => {
    expect(grantsScope(['captures:write'], 'captures:write')).toBe(true);
  });

  it('does not grant a scope the token lacks', () => {
    expect(grantsScope([], 'captures:write')).toBe(false);
  });

  // Lo guardado en la base es texto: un scope que ya no existe no concede nada.
  it('ignores stored scopes that are not exactly the one asked for', () => {
    expect(grantsScope(['captures:*', 'CAPTURES:WRITE'], 'captures:write')).toBe(false);
  });
});

describe('personal access token lifetime', () => {
  it('lasts ninety days unless another lifetime is chosen', () => {
    expect(PERSONAL_ACCESS_TOKEN_DEFAULT_TTL_DAYS).toBe(90);
    expect(personalAccessTokenExpiresAt(CLOCK)).toEqual(new Date('2026-12-21T15:00:00.000Z'));
  });

  it('can be chosen when the token is created', () => {
    expect(personalAccessTokenExpiresAt(CLOCK, 7)).toEqual(new Date('2026-09-29T15:00:00.000Z'));
  });

  it('allows between one day and a year', () => {
    expect(PERSONAL_ACCESS_TOKEN_MIN_TTL_DAYS).toBe(1);
    expect(PERSONAL_ACCESS_TOKEN_MAX_TTL_DAYS).toBe(365);
  });

  it('accepts the shortest lifetime', () => {
    expect(personalAccessTokenExpiresAt(CLOCK, 1)).toEqual(new Date('2026-09-23T15:00:00.000Z'));
  });

  it('accepts the longest lifetime', () => {
    expect(personalAccessTokenExpiresAt(CLOCK, 365)).toEqual(new Date('2027-09-22T15:00:00.000Z'));
  });

  // Nunca "sin caducidad": un token olvidado tiene que dejar de servir solo.
  it.each([0, -1, 366, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a lifetime of %s days',
    (days) => {
      expect(() => personalAccessTokenExpiresAt(CLOCK, days)).toThrow(InvalidTokenLifetimeError);
    },
  );

  it('reads the instant from the clock, never from the real time', () => {
    const y2030 = FixedClock.at('2030-01-01T00:00:00.000Z');

    expect(personalAccessTokenExpiresAt(y2030, 1)).toEqual(new Date('2030-01-02T00:00:00.000Z'));
  });

  it('reports the rule as a domain error with a stable code', () => {
    const error = new InvalidTokenLifetimeError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INVALID_TOKEN_LIFETIME');
    expect(error.message).toBe('A personal access token must last between 1 and 365 whole days.');
  });
});
