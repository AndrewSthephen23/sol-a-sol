import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, newNonce } from './csp';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');

      return [name, values];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('lets only the scripts with this nonce run in production, and nothing inline', () => {
    const policy = directives(contentSecurityPolicy('abc123', false));

    expect(policy.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(policy.get('style-src')).toEqual(["'self'", "'nonce-abc123'"]);
    expect(contentSecurityPolicy('abc123', false)).not.toContain('unsafe');
  });

  it('closes what the web never uses', () => {
    const policy = directives(contentSecurityPolicy('n', false));

    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('connect-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
  });

  it('relaxes eval and inline styles only in development, for React and its overlay', () => {
    const policy = directives(contentSecurityPolicy('n', true));

    expect(policy.get('script-src')).toContain("'unsafe-eval'");
    expect(policy.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe('newNonce', () => {
  it('is 128 random bits in base64, different every time', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => newNonce()));

    expect(nonces.size).toBe(100);
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16);
  });
});
