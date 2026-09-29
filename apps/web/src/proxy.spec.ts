import { getRewrittenUrl } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_API_URL, proxy } from './proxy';

function rewrittenFrom(url: string): string | null {
  return getRewrittenUrl(proxy(new NextRequest(url)));
}

describe('proxy', () => {
  afterEach(() => {
    delete process.env.API_URL;
  });

  it('forwards the path and query to the API read from API_URL at request time', () => {
    process.env.API_URL = 'http://api:3001';

    expect(rewrittenFrom('http://localhost:3000/api/v1/transactions?limit=20')).toBe(
      'http://api:3001/api/v1/transactions?limit=20',
    );
  });

  it('falls back to the local API when API_URL is not set', () => {
    expect(rewrittenFrom('http://localhost:3000/api/v1/auth/refresh')).toBe(
      `${DEFAULT_API_URL}/api/v1/auth/refresh`,
    );
  });

  it('never leaves the API origin, even for a path that looks like another host', () => {
    process.env.API_URL = 'http://api:3001';

    const rewritten = rewrittenFrom('http://localhost:3000/api//evil.example/x');

    expect(new URL(rewritten ?? '').origin).toBe('http://api:3001');
  });
});
