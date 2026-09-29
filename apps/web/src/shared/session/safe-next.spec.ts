import { describe, expect, it } from 'vitest';

import { loginUrl, safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/transactions', '/transactions'],
    ['/transactions?month=2026-09#top', '/transactions?month=2026-09#top'],
  ])('keeps a path of the web itself: %s', (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });

  it.each([
    ['nothing', null],
    ['an absolute URL', 'https://evil.example/login'],
    ['a protocol-relative URL', '//evil.example'],
    ['something that is not even a URL', '//['],
    ['a backslash the browser reads as a slash', '/\\evil.example'],
    ['a scheme without slashes', 'https:evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'transactions'],
    ['the login itself, which would loop', '/login?next=/login'],
  ])('sends %s to the home page', (_case, value) => {
    expect(safeNext(value)).toBe('/');
  });
});

describe('loginUrl', () => {
  it('remembers where the person wanted to go', () => {
    expect(loginUrl('/transactions?month=2026-09')).toBe(
      '/login?next=%2Ftransactions%3Fmonth%3D2026-09',
    );
  });

  it('adds nothing when the destination is the home page', () => {
    expect(loginUrl('/')).toBe('/login');
  });
});
