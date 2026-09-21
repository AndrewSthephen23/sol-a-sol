import { describe, expect, it, vi } from 'vitest';

import {
  clearRefreshCookie,
  type CookieResponse,
  readRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.js';

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } satisfies CookieResponse;
}

describe('readRefreshCookie', () => {
  it('finds the cookie when it is the only one', () => {
    expect(readRefreshCookie(`${REFRESH_COOKIE}=abc123`)).toBe('abc123');
  });

  it('finds it among others', () => {
    expect(readRefreshCookie(`theme=dark; ${REFRESH_COOKIE}=abc123; lang=es`)).toBe('abc123');
  });

  it('ignores the spaces the browser puts between cookies', () => {
    expect(readRefreshCookie(`theme=dark;   ${REFRESH_COOKIE}=abc123`)).toBe('abc123');
  });

  // RFC 6265 permite entrecomillar el valor.
  it('unwraps a quoted value', () => {
    expect(readRefreshCookie(`${REFRESH_COOKIE}="abc123"`)).toBe('abc123');
  });

  it('does not confuse a cookie whose name merely ends the same', () => {
    expect(readRefreshCookie(`not_${REFRESH_COOKIE}=otro`)).toBeUndefined();
  });

  it('returns nothing when the cookie is not there', () => {
    expect(readRefreshCookie('theme=dark')).toBeUndefined();
  });

  it('returns nothing when there is no header at all', () => {
    expect(readRefreshCookie(undefined)).toBeUndefined();
  });

  it('survives a malformed header', () => {
    expect(readRefreshCookie('esto-no-tiene-igual')).toBeUndefined();
  });

  it('reads an empty value as empty, not as missing', () => {
    expect(readRefreshCookie(`${REFRESH_COOKIE}=`)).toBe('');
  });
});

describe('setRefreshCookie', () => {
  const expires = new Date('2026-10-20T15:00:00.000Z');

  it('sets the three attributes that keep the session safe', () => {
    const response = fakeResponse();

    setRefreshCookie(response, 'abc123', expires);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'abc123',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' }),
    );
  });

  it('limits the cookie to the session endpoints', () => {
    const response = fakeResponse();

    setRefreshCookie(response, 'abc123', expires);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'abc123',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });

  it('gives it the same expiry as the token it carries', () => {
    const response = fakeResponse();

    setRefreshCookie(response, 'abc123', expires);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'abc123',
      expect.objectContaining({ expires }),
    );
  });
});

describe('clearRefreshCookie', () => {
  // El navegador solo borra la cookie que coincide en nombre y path.
  it('clears it with the same attributes it was set with', () => {
    const response = fakeResponse();

    clearRefreshCookie(response);

    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
      }),
    );
  });
});
