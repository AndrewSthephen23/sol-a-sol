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

  it('leaves the API responses without a page policy: they are JSON', () => {
    const response = proxy(new NextRequest('http://localhost:3000/api/v1/auth/login'));

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('never leaves the API origin, even for a path that looks like another host', () => {
    process.env.API_URL = 'http://api:3001';

    const rewritten = rewrittenFrom('http://localhost:3000/api//evil.example/x');

    expect(new URL(rewritten ?? '').origin).toBe('http://api:3001');
  });

  describe('pages', () => {
    function policyOf(url: string) {
      const response = proxy(new NextRequest(url));

      return {
        sent: response.headers.get('Content-Security-Policy'),
        // Next lee el nonce de la petición reenviada, para ponérselo a sus scripts.
        forwarded: response.headers.get('x-middleware-request-content-security-policy'),
        rewritten: getRewrittenUrl(response),
      };
    }

    it('send a policy with a nonce, and hand the same one to Next', () => {
      const { sent, forwarded, rewritten } = policyOf('http://localhost:3000/transactions');

      expect(sent).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/u);
      expect(forwarded).toBe(sent);
      expect(rewritten).toBeNull();
    });

    it('use a new nonce on every request', () => {
      const first = policyOf('http://localhost:3000/login').sent;
      const second = policyOf('http://localhost:3000/login').sent;

      expect(first).not.toBe(second);
    });
  });
});
