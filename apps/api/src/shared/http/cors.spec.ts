import { describe, expect, it } from 'vitest';

import { ALLOWED_HEADERS, DEFAULT_WEB_ORIGIN, webOriginsFrom } from './cors.js';

describe('webOriginsFrom', () => {
  it('reads a single origin', () => {
    expect(webOriginsFrom('https://sol-a-sol.pe')).toEqual(['https://sol-a-sol.pe']);
  });

  it('reads several, separated by commas and however they are spaced', () => {
    expect(webOriginsFrom('https://sol-a-sol.pe,  https://www.sol-a-sol.pe ')).toEqual([
      'https://sol-a-sol.pe',
      'https://www.sol-a-sol.pe',
    ]);
  });

  // Olvidar la variable no puede significar "que llame cualquiera".
  it.each([undefined, '', '   ', ',,'])('falls back to the local web with %j', (value) => {
    expect(webOriginsFrom(value)).toEqual([DEFAULT_WEB_ORIGIN]);
  });

  it('never allows every origin', () => {
    expect(webOriginsFrom('*')).not.toContain(DEFAULT_WEB_ORIGIN);
    expect(webOriginsFrom(undefined)).not.toContain('*');
  });

  it('lets the browser send only the headers the API uses', () => {
    expect(ALLOWED_HEADERS).toEqual(['Content-Type', 'Authorization', 'X-Request-Id']);
  });
});
